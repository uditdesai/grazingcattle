import type { Cow, FarmEvent } from "@grazingcattle/game-types";
import { DAILY_INTAKE_FRACTION_OF_BODYWEIGHT } from "./grazing";
import { rngFor } from "./rng";

/**
 * Calibration references (not gospel): liveweight loss ~ -0.02 kg/day/animal
 * under high stocking + low grass allowance; gains up to +0.655 kg/day
 * under good spring/summer conditions.
 */
const WEIGHT = {
  /**
   * Fraction of full intake that merely covers maintenance. Below this the
   * cow loses condition, above it gains.
   */
  maintenanceFraction: 0.75,
  /** How fast condition (fat cover, not frame) moves at full over/under-feed, kg/day. */
  conditionRateKgPerDay: 0.5,
  /** Weight is held within this band around age-expected weight. */
  minWeightFractionOfExpected: 0.45,
  maxWeightFractionOfExpected: 1.2,
  /** Age at which frame growth is complete. */
  maturityDays: 730,
  /** Birth weight as a fraction of mature weight. */
  birthWeightFraction: 0.064,
};

/**
 * The weight a well-fed animal of this age and frame should carry. Frame
 * grows linearly from birth weight to mature weight over `maturityDays`,
 * which yields ~0.7 kg/day of skeletal growth for a 550 kg frame — in line
 * with real calf/yearling growth rates.
 */
export function expectedWeightForAge(cow: Cow): number {
  const growthProgress = Math.min(1, cow.ageDays / WEIGHT.maturityDays);
  const frameFraction =
    WEIGHT.birthWeightFraction + (1 - WEIGHT.birthWeightFraction) * growthProgress;
  return cow.matureWeightKg * frameFraction;
}

const AGE_THRESHOLDS_DAYS = {
  calfToJuvenile: 90,
  juvenileToBreeding: 730,
  breedingToOld: 365 * 8,
};

const GESTATION_DAYS = 283;

/**
 * Updates one cow's weight for one hour based on how much of its needed
 * intake was actually available. availableForageKg is this cow's share of
 * what its paddock could provide this hour (computed by the grazing step).
 */
export function updateCowWeightOneHour(cow: Cow, availableForageKgThisHour: number): Cow {
  const hourlyIntakeNeededKg = (cow.weightKg * DAILY_INTAKE_FRACTION_OF_BODYWEIGHT) / 24;

  const forageQualityFactor = 1; // placeholder until grass "quality" (vs. quantity) exists
  const intakeRatio =
    hourlyIntakeNeededKg > 0 ? availableForageKgThisHour / hourlyIntakeNeededKg : 1;

  const expectedWeightKg = expectedWeightForAge(cow);

  // Frame growth: skeletal growth follows the age trajectory, but only to
  // the extent the animal is actually fed. A mature cow has no frame growth
  // left, so good feeding shows up as condition instead.
  const frameGrowthKgPerDay =
    cow.ageDays < WEIGHT.maturityDays
      ? ((cow.matureWeightKg * (1 - WEIGHT.birthWeightFraction)) / WEIGHT.maturityDays) *
        clamp(intakeRatio, 0, 1)
      : 0;

  // Condition: gained above maintenance, lost below it. Intake below need
  // produces weight loss automatically — no separate starvation system.
  const nutritionBalance = (intakeRatio - WEIGHT.maintenanceFraction) / (1 - WEIGHT.maintenanceFraction);
  const conditionKgPerDay = clamp(nutritionBalance, -1, 1) * WEIGHT.conditionRateKgPerDay;

  const weightKg = clamp(
    cow.weightKg + (frameGrowthKgPerDay + conditionKgPerDay) / 24,
    expectedWeightKg * WEIGHT.minWeightFractionOfExpected,
    expectedWeightKg * WEIGHT.maxWeightFractionOfExpected,
  );

  return { ...cow, weightKg };
}

/**
 * Body condition and health are DERIVED from how the animal's weight
 * compares to what its age and frame call for — not integrated from the
 * weight trend, which let condition drift without bound in either
 * direction (obese cows on good pasture, permanently emaciated but immortal
 * cows on bare ground).
 */
export function updateCowConditionOneHour(cow: Cow): Cow {
  const expectedWeightKg = expectedWeightForAge(cow);
  const weightRatio = expectedWeightKg > 0 ? cow.weightKg / expectedWeightKg : 1;

  // BCS 5 at expected weight; ~2 at 25% underweight, ~7 at 20% over.
  const bodyConditionScore = clamp(5 + (weightRatio - 1) * 12, 1, 9);

  // Health drifts toward what body condition implies (BCS 5+ = fully healthy).
  const targetHealth = clamp(bodyConditionScore / 5, 0, 1);
  const health = clamp(cow.health + (targetHealth - cow.health) * 0.004, 0, 1);

  return { ...cow, bodyConditionScore, health };
}

export function ageCowOneHour(cow: Cow): Cow {
  const ageDays = cow.ageDays + 1 / 24;
  let status = cow.status;

  if (status === "calf" && ageDays >= AGE_THRESHOLDS_DAYS.calfToJuvenile) {
    status = "juvenile";
  } else if (status === "juvenile" && ageDays >= AGE_THRESHOLDS_DAYS.juvenileToBreeding) {
    status = "breeding";
  } else if (status === "breeding" && ageDays >= AGE_THRESHOLDS_DAYS.breedingToOld) {
    status = "old";
  }

  let pregnancyDays = cow.pregnancyDays;
  if (cow.pregnant && pregnancyDays !== undefined) {
    pregnancyDays += 1 / 24;
  }

  return { ...cow, ageDays, status, pregnancyDays };
}

/**
 * Checks whether a mature, healthy female becomes pregnant this hour.
 * Reproduction depends on base fertility x health modifier x nutrition
 * modifier - poor pasture management reduces reproduction over time, since
 * nutritionModifier is derived from body condition (itself driven by forage).
 */
export function checkBreedingOneHour(
  cow: Cow,
  farmSeed: string,
  simHour: number,
): Cow {
  const isEligible =
    cow.sex === "female" &&
    (cow.status === "breeding" || cow.status === "productive") &&
    !cow.pregnant &&
    cow.health > 0.5;

  if (!isEligible) return cow;

  const nutritionModifier = clamp(cow.bodyConditionScore / 5, 0, 1.2);
  const healthModifier = cow.health;
  const hourlyProbability = (cow.fertility * healthModifier * nutritionModifier) / (365 * 24 * 0.3);

  const rng = rngFor(farmSeed, simHour, `breeding:${cow.id}`);
  if (rng.chance(hourlyProbability)) {
    return { ...cow, pregnant: true, pregnancyDays: 0 };
  }
  return cow;
}

/**
 * Delivers a calf if gestation is complete. Returns the (updated) mother
 * and a newborn calf if one was born this hour, plus an event.
 */
export function checkBirthOneHour(
  mother: Cow,
  farmSeed: string,
  simHour: number,
  farmId: string,
): { mother: Cow; calf: Cow | null; event: FarmEvent | null } {
  if (!mother.pregnant || mother.pregnancyDays === undefined) {
    return { mother, calf: null, event: null };
  }
  if (mother.pregnancyDays < GESTATION_DAYS) {
    return { mother, calf: null, event: null };
  }

  const rng = rngFor(farmSeed, simHour, `birth:${mother.id}`);
  const calf: Cow = {
    id: `cow_${rng.int(100000, 999999)}`,
    sex: rng.chance(0.5) ? "female" : "male",
    breed: mother.breed,
    ageDays: 0,
    matureWeightKg: mother.matureWeightKg,
    weightKg: mother.matureWeightKg * 0.064,
    bodyConditionScore: 5,
    health: 0.9,
    fertility: 0.8,
    pregnant: false,
    status: "calf",
    currentPaddockId: mother.currentPaddockId,
    birthSimHour: simHour,
  };

  const updatedMother: Cow = { ...mother, pregnant: false, pregnancyDays: undefined };

  const event: FarmEvent = {
    id: `evt_${rng.int(100000, 999999)}`,
    farmId,
    simHour,
    type: "CALF_BORN",
    data: { calfId: calf.id, motherId: mother.id },
  };

  return { mother: updatedMother, calf, event };
}

/**
 * Checks for death this hour: old age, malnutrition (chronic low health),
 * or a small baseline disease/injury risk. No graphic depiction - this is
 * purely a numeric outcome the caller can turn into an event.
 */
export function checkDeathOneHour(
  cow: Cow,
  farmSeed: string,
  simHour: number,
  farmId: string,
): FarmEvent | null {
  if (cow.status === "dead" || cow.status === "sold" || cow.status === "slaughtered") {
    return null;
  }

  const rng = rngFor(farmSeed, simHour, `death:${cow.id}`);

  let cause: "old_age" | "disease" | "injury" | "malnutrition" | null = null;

  const oldAgeDays = AGE_THRESHOLDS_DAYS.breedingToOld + 365 * 4;
  if (cow.status === "old" && cow.ageDays > oldAgeDays) {
    const excessYears = (cow.ageDays - oldAgeDays) / 365;
    if (rng.chance(0.0002 * (1 + excessYears))) cause = "old_age";
  }

  // Emaciation kills. Keyed to body condition rather than the derived
  // health value, so a chronically starving animal actually dies instead of
  // sitting at a low score indefinitely. BCS 3 is thin; BCS 1 is terminal.
  if (!cause && cow.bodyConditionScore < 3) {
    const severity = 3 - cow.bodyConditionScore;
    if (rng.chance(0.0004 * severity)) cause = "malnutrition";
  }

  if (!cause && rng.chance(0.000005)) {
    cause = "disease";
  }

  if (!cause) return null;

  return {
    id: `evt_${rng.int(100000, 999999)}`,
    farmId,
    simHour,
    type: "COW_DIED",
    data: { cowId: cow.id, cause },
  };
}

function clamp(value: number, min: number, max: number): number {
  return Math.max(min, Math.min(max, value));
}

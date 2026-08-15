import type { Cow, FarmEvent } from "@grazingcattle/game-types";
import { COW_LIFECYCLE, COW_MORTALITY, COW_WEIGHT, GRAZING } from "./constants";
import { rngFor } from "./rng";

// ---------------------------------------------------------------------------
// PLAIN-ENGLISH OVERVIEW
//
// Two separate ideas about a cow's size:
//   - "frame" (matureWeightKg, expectedWeightForAge): how big this animal's
//     skeleton grows to be over its lifetime, regardless of feeding. A
//     calf's frame grows steadily whether pasture is great or poor.
//   - "condition" (bodyConditionScore, weightKg vs. expected): how well-fed
//     the animal is RIGHT NOW relative to its frame. This is what swings
//     up and down week to week with grazing management.
// weightKg = frame + condition combined, and everything else in this file
// (health, fertility, death risk) is ultimately driven by how well-fed the
// animal has been, which traces all the way back to the grass it could
// actually reach.
// ---------------------------------------------------------------------------

/**
 * The weight a well-fed animal of this age and frame should carry. Frame
 * grows linearly from birth weight to mature weight over maturityDays,
 * which yields ~0.7 kg/day of skeletal growth for a 550 kg frame — in line
 * with real calf/yearling growth rates.
 */
export const expectedWeightForAge = (cow: Cow): number => {
  // growthProgress goes from 0 (just born) to 1 (fully grown at
  // maturityDays). frameFraction interpolates linearly from
  // birthWeightFraction (a newborn is ~6.4% of its adult weight) up to
  // 100% — so a cow halfway to maturity should weigh roughly halfway
  // between its birth weight and its mature weight.
  const growthProgress = Math.min(1, cow.ageDays / COW_WEIGHT.maturityDays);
  const frameFraction =
    COW_WEIGHT.birthWeightFraction + (1 - COW_WEIGHT.birthWeightFraction) * growthProgress;
  return cow.matureWeightKg * frameFraction;
};

/**
 * Updates one cow's weight for one hour based on how much of its needed
 * intake was actually available. availableForageKg is this cow's share of
 * what its paddock could provide this hour (computed by the grazing step).
 */
export const updateCowWeightOneHour = (cow: Cow, availableForageKgThisHour: number): Cow => {
  const hourlyIntakeNeededKg = (cow.weightKg * GRAZING.dailyIntakeFractionOfBodyweight) / 24;

  const forageQualityFactor = 1; // placeholder until grass "quality" (vs. quantity) exists

  // intakeRatio: 1.0 means "got exactly what it needed", 0.5 means "got
  // half", 0 means "got nothing". availableForageKgThisHour comes from
  // grazing.ts's forageReceivedPerCow — it already accounts for a
  // grazed-down paddock limiting what this cow could actually eat.
  const intakeRatio =
    hourlyIntakeNeededKg > 0 ? availableForageKgThisHour / hourlyIntakeNeededKg : 1;

  const expectedWeightKg = expectedWeightForAge(cow);

  // Frame growth: skeletal growth follows the age trajectory, but only to
  // the extent the animal is actually fed. A mature cow has no frame growth
  // left, so good feeding shows up as condition instead.
  const frameGrowthKgPerDay =
    cow.ageDays < COW_WEIGHT.maturityDays
      ? ((cow.matureWeightKg * (1 - COW_WEIGHT.birthWeightFraction)) / COW_WEIGHT.maturityDays) *
        clamp(intakeRatio, 0, 1)
      : 0;

  // Condition: gained above maintenance, lost below it. maintenanceFraction
  // (0.75) is the breakeven point — eating 75% of what's needed just covers
  // upkeep with no weight change; eating more puts on condition, eating
  // less burns it off. Intake below need produces weight loss automatically
  // — no separate "starvation" system needed.
  const nutritionBalance =
    (intakeRatio - COW_WEIGHT.maintenanceFraction) / (1 - COW_WEIGHT.maintenanceFraction);
  const conditionKgPerDay = clamp(nutritionBalance, -1, 1) * COW_WEIGHT.conditionRateKgPerDay;

  // Total weight = frame growth + condition change, applied for 1/24th of
  // a day (this function runs once per simulated hour). Clamped to a
  // sensible band around expected weight so a single terrible hour can't
  // send weight to zero or an amazing hour double it overnight.
  const weightKg = clamp(
    cow.weightKg + (frameGrowthKgPerDay + conditionKgPerDay) / 24,
    expectedWeightKg * COW_WEIGHT.minWeightFractionOfExpected,
    expectedWeightKg * COW_WEIGHT.maxWeightFractionOfExpected,
  );

  return { ...cow, weightKg };
};

/**
 * Body condition and health are DERIVED from how the animal's weight
 * compares to what its age and frame call for — not integrated from the
 * weight trend, which let condition drift without bound in either
 * direction (obese cows on good pasture, permanently emaciated but immortal
 * cows on bare ground).
 */
export const updateCowConditionOneHour = (cow: Cow): Cow => {
  const expectedWeightKg = expectedWeightForAge(cow);
  // weightRatio: 1.0 = exactly on target for its age, > 1 = heavier than
  // expected (well-fed), < 1 = lighter than expected (underfed).
  const weightRatio = expectedWeightKg > 0 ? cow.weightKg / expectedWeightKg : 1;

  // BCS 5 at expected weight; ~2 at 25% underweight, ~7 at 20% over.
  const bodyConditionScore = clamp(5 + (weightRatio - 1) * COW_WEIGHT.bcsSensitivity, 1, 9);

  // Health doesn't jump instantly to match body condition — it drifts
  // toward it a small step each hour, same slow-catch-up pattern as soil
  // health in soil.ts. BCS 5 or above counts as "fully healthy" (targetHealth
  // caps at 1); below that, health trails downward over time.
  const targetHealth = clamp(bodyConditionScore / 5, 0, 1);
  const health = clamp(cow.health + (targetHealth - cow.health) * COW_WEIGHT.healthDriftRate, 0, 1);

  return { ...cow, bodyConditionScore, health };
};

/**
 * Advances age by one hour (1/24 of a day) and moves the cow through its
 * life-stage labels (calf -> juvenile -> breeding -> old) once it crosses
 * each age threshold. Also advances pregnancy day count, if pregnant.
 */
export const ageCowOneHour = (cow: Cow): Cow => {
  const ageDays = cow.ageDays + 1 / 24;
  let status = cow.status;

  if (status === "calf" && ageDays >= COW_LIFECYCLE.calfToJuvenileDays) {
    status = "juvenile";
  } else if (status === "juvenile" && ageDays >= COW_LIFECYCLE.juvenileToBreedingDays) {
    status = "breeding";
  } else if (status === "breeding" && ageDays >= COW_LIFECYCLE.breedingToOldDays) {
    status = "old";
  }

  let pregnancyDays = cow.pregnancyDays;
  if (cow.pregnant && pregnancyDays !== undefined) {
    pregnancyDays += 1 / 24;
  }

  return { ...cow, ageDays, status, pregnancyDays };
};

/**
 * Checks whether a mature, healthy female becomes pregnant this hour.
 * Reproduction depends on base fertility x health modifier x nutrition
 * modifier - poor pasture management reduces reproduction over time, since
 * nutritionModifier is derived from body condition (itself driven by forage).
 */
export const checkBreedingOneHour = (cow: Cow, farmSeed: string, simHour: number): Cow => {
  const isEligible =
    cow.sex === "female" &&
    (cow.status === "breeding" || cow.status === "productive") &&
    !cow.pregnant &&
    cow.health > 0.5;

  if (!isEligible) return cow;

  // The three multipliers combine into one hourly probability: a
  // well-fed, healthy, naturally fertile cow has the best odds each hour.
  // conceptionWindowYears (0.3) means a cow with all modifiers at 1.0
  // takes roughly 0.3 years on average to conceive. Poor nutrition (low
  // bodyConditionScore) directly lowers this every single hour.
  const nutritionModifier = clamp(
    cow.bodyConditionScore / 5,
    0,
    COW_LIFECYCLE.nutritionModifierCap,
  );
  const healthModifier = cow.health;
  const hourlyProbability =
    (cow.fertility * healthModifier * nutritionModifier) /
    (365 * 24 * COW_LIFECYCLE.conceptionWindowYears);

  const rng = rngFor(farmSeed, simHour, `breeding:${cow.id}`);
  if (rng.chance(hourlyProbability)) {
    return { ...cow, pregnant: true, pregnancyDays: 0 };
  }
  return cow;
};

/**
 * Delivers a calf if gestation is complete. Returns the (updated) mother
 * and a newborn calf if one was born this hour, plus an event.
 */
export const checkBirthOneHour = (
  mother: Cow,
  farmSeed: string,
  simHour: number,
  farmId: string,
): { mother: Cow; calf: Cow | null; event: FarmEvent | null } => {
  if (!mother.pregnant || mother.pregnancyDays === undefined) {
    return { mother, calf: null, event: null };
  }
  if (mother.pregnancyDays < COW_LIFECYCLE.gestationDays) {
    return { mother, calf: null, event: null };
  }

  const rng = rngFor(farmSeed, simHour, `birth:${mother.id}`);
  const calf: Cow = {
    id: `cow_${rng.int(100000, 999999)}`,
    sex: rng.chance(0.5) ? "female" : "male",
    breed: mother.breed,
    ageDays: 0,
    matureWeightKg: mother.matureWeightKg,
    weightKg: mother.matureWeightKg * COW_LIFECYCLE.calfBirthWeightFraction,
    bodyConditionScore: 5,
    health: COW_LIFECYCLE.calfBaseHealth,
    fertility: COW_LIFECYCLE.calfBaseFertility,
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
};

/**
 * Checks for death this hour: old age, malnutrition (chronic low BCS),
 * or a small baseline disease/injury risk.
 */
export const checkDeathOneHour = (
  cow: Cow,
  farmSeed: string,
  simHour: number,
  farmId: string,
): FarmEvent | null => {
  if (cow.status === "dead" || cow.status === "sold" || cow.status === "slaughtered") {
    return null;
  }

  const rng = rngFor(farmSeed, simHour, `death:${cow.id}`);

  let cause: "old_age" | "disease" | "injury" | "malnutrition" | null = null;

  // Old age: risk starts after breedingToOldDays + oldAgeExtraYears and
  // scales up with each additional year past that point.
  const oldAgeDays =
    COW_LIFECYCLE.breedingToOldDays + COW_MORTALITY.oldAgeExtraYears * 365;
  if (cow.status === "old" && cow.ageDays > oldAgeDays) {
    const excessYears = (cow.ageDays - oldAgeDays) / 365;
    if (rng.chance(COW_MORTALITY.oldAgeBaseRiskPerHour * (1 + excessYears))) cause = "old_age";
  }

  // Emaciation kills. Keyed to body condition rather than the derived
  // health value, so a chronically starving animal actually dies instead of
  // sitting at a low score indefinitely.
  if (!cause && cow.bodyConditionScore < COW_MORTALITY.malnutritionBcsThreshold) {
    const severity = COW_MORTALITY.malnutritionBcsThreshold - cow.bodyConditionScore;
    if (rng.chance(COW_MORTALITY.malnutritionRiskPerHour * severity)) cause = "malnutrition";
  }

  if (!cause && rng.chance(COW_MORTALITY.diseaseBaseRiskPerHour)) {
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
};

const clamp = (value: number, min: number, max: number): number => {
  return Math.max(min, Math.min(max, value));
};

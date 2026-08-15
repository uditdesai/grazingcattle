/**
 * Single source of truth for all tunable simulation constants.
 *
 * Every number here is either derived from a real-world reference or
 * calibrated empirically in Step 6. The source comment on each constant
 * explains where it came from so future tuning is informed rather than
 * arbitrary.
 *
 * To tune: change a number here; all files that use it pick up the change
 * automatically. Do NOT hard-code these values in individual simulation
 * files — that's what this file is for.
 */

import type { Season } from "@grazingcattle/game-types";

// ─── GRASS GROWTH ────────────────────────────────────────────────────────────

export const GRASS = {
  /**
   * Base fractional growth rate per hour at ideal conditions (rootHealth=1,
   * optimal temperature, adequate moisture). Calibrated so the annual yield
   * lands in the 5,000–12,000 kg DM/ha/yr range observed in temperate
   * grasslands (measured: ~6,700 kg DM/ha/yr).
   * Reference: Cacho (1993) sigmoid pasture growth model.
   */
  baseGrowthRatePerHour: 0.0035,

  /** Temperature (°C) at which growth is fastest — peak photosynthesis for C3 temperate grasses. */
  optimalTempC: 20,

  /**
   * Gaussian falloff constant away from optimalTempC.
   * At 4°C (winter mean), temperatureFactor ≈ 0.08 (near-dormant).
   * At 24°C (summer mean), temperatureFactor ≈ 0.85.
   * Previously 0.0035, which let winter grow at 40% of peak — no dormancy.
   */
  tempSensitivity: 0.01,

  /** Below this temperature, growth stops entirely (winter dormancy). */
  minGrowthTempC: 2,

  /**
   * Plant-available water capacity of the root zone, mm.
   * Converts real mm rainfall/evapotranspiration into the cell's 0–1
   * moisture bucket rather than using arbitrary scaling.
   * Reference: typical temperate grassland root zone ~100–150 mm.
   */
  rootZoneCapacityMm: 120,

  /**
   * Soil moisture fraction above which water is no longer limiting.
   * Below 0.6, growth is throttled proportionally. Above it, the moisture
   * factor maxes out at 1.
   */
  moistureFullFactor: 0.6,

  /**
   * Seed bank and dormant root bud term added to the logistic formula.
   * Pure logistic growth from biomass=0 is always exactly 0 (nothing to
   * photosynthesize with), so a perfectly bare paddock could never restart.
   * This term represents dormant seeds and root buds that are always present
   * in the soil regardless of standing biomass. 5 kg/ha contributes < 0.02
   * kg/ha/hour at peak conditions — tiny, but enough to start recovery.
   */
  seedBiomassKgHa: 5,

  /**
   * Minimum root health multiplier in the growth formula.
   * Prevents the deadlock where rootHealth=0 → growthRate=0 → biomass can
   * never recover → rootHealth can never recover. At 0.02, a fully destroyed
   * paddock still grows at ~2% of peak — punishingly slow (years to recover),
   * but not permanently unrecoverable.
   */
  rootHealthFloor: 0.02,
};

// ─── GRAZING ─────────────────────────────────────────────────────────────────

export const GRAZING = {
  /**
   * Cattle eat roughly 2.5% of their body weight in dry matter per day.
   * This is the basis of the Animal Unit Month (AUM) in range management.
   * Reference: USDA Natural Resources Conservation Service grazing guidelines.
   */
  dailyIntakeFractionOfBodyweight: 0.025,

  /**
   * "Take half, leave half" — the standard rangeland guideline.
   * Root health starts taking damage any hour that standing biomass is below
   * half of what that cell can carry. Expressed as a STATE (current biomass
   * vs. a fixed line) rather than a flow (how much was eaten this hour).
   * See the long comment in grazing.ts for the bug this fixed.
   */
  criticalResidualFraction: 0.5,

  /**
   * Root health lost per hour when the paddock is being actively grazed
   * below the critical residual. At maximum shortfall (biomass = 0),
   * rootHealth reaches 0 in ~500 hours (~3 weeks) of continuous overgrazing.
   */
  rootHealthPenaltyPerHour: 0.002,

  /**
   * Root health recovered per hour when the paddock is not being overgrazed
   * (either ungrazed, or grazed but above the residual line). At this rate,
   * full recovery from rootHealth=0 takes ~1,667 hours (~70 days) of rest —
   * multiple seasons if roots were severely damaged.
   */
  rootHealthRecoveryPerHour: 0.0006,

  /**
   * Half-saturation constant for sward-limited intake, kg DM/ha.
   * Michaelis-Menten form: at 600 kg/ha standing biomass, cattle can only
   * achieve ~50% of their potential intake rate (they can't take big enough
   * bites on a short sward). At 2,500 kg/ha (full standing crop) they
   * approach 100%.
   * Reference: standard form in GrassGro and APSIM-AgPasture grazing models.
   */
  intakeHalfSaturationKgHa: 600,
};

// ─── SOIL ────────────────────────────────────────────────────────────────────

export const SOIL = {
  /**
   * Fraction of grazed dry matter that returns to the cell as plant-available
   * nutrients via manure. Real-world values vary 30–50% depending on
   * retention time on the paddock; 0.35 is a conservative midpoint.
   */
  manureNutrientReturnFactor: 0.35,

  /**
   * Converts a manure deposit (kg DM removed × returnFactor) into a change
   * in the 0–1 nutrients bucket. Calibrated so a full day of heavy grazing
   * moves nutrients by roughly 0.01–0.02 — noticeable over weeks, not hours.
   */
  nutrientDepositScale: 0.0008,

  /**
   * Nutrients depleted per hour by growing grass (background uptake).
   * Without this, nutrients would only ever rise under grazing and a rested
   * paddock would accumulate unbounded nutrients.
   */
  nutrientBaseDecayPerHour: 0.00005,

  /**
   * Per-hour rate at which soilHealth drifts toward its grazing-intensity
   * target. At 0.0006, it takes ~1,667 hours (~70 days) to move halfway
   * across the full 0–1 range — soil responds over months, not days.
   */
  healthDriftRatePerHour: 0.0006,

  /**
   * Depletion level (0=full, 1=bare) at which the soil health target peaks.
   * 0.3 means "grazed down to 70% of max carrying capacity" — the sweet spot
   * where manure return, root turnover, and biological disturbance combine to
   * maximize soil biology. Neither rest nor heavy use beats moderate use.
   * Reference: non-monotonic soil health response in Teague et al. (2011).
   */
  moderateUsePeakDepletion: 0.3,

  /** Gaussian spread on the low-depletion side (toward resting). Gentler falloff. */
  moderateUseSpreadLow: 0.5,

  /**
   * Gaussian spread on the high-depletion side (toward overgrazing). Sharper
   * falloff — overgrazing degrades soil health faster than resting does.
   */
  moderateUseSpreadHigh: 0.25,

  /**
   * Per-hour rate at which biodiversity drifts toward its target.
   * Intentionally ~20× slower than soilHealth — biodiversity changes over
   * years of sustained management, not months.
   */
  biodiversityDriftRatePerHour: 0.00003,

  /** Depletion must exceed this to count as "actively grazed" for biodiversity. */
  biodiversityHealthyDepletionMin: 0.15,

  /** Above this depletion, biodiversity target is capped (overgrazing harms diversity). */
  biodiversityHealthyDepletionMax: 0.55,

  /**
   * When depletion is outside the healthy range, biodiversity can only reach
   * 60% of soil health (vs. 100% inside the range). Captures the idea that
   * both chronic overgrazing and chronic rest reduce plant species richness.
   */
  biodiversityOutOfRangeCap: 0.6,
};

// ─── COWS — WEIGHT & CONDITION ───────────────────────────────────────────────

export const COW_WEIGHT = {
  /**
   * Fraction of full intake that covers maintenance with no weight change.
   * Above 0.75, the cow gains condition; below it, she loses condition.
   * Reference: NRC (2000) Nutrient Requirements of Beef Cattle, maintenance
   * requirement ~70–80% of ad-lib intake.
   */
  maintenanceFraction: 0.75,

  /**
   * Maximum rate of condition change (fat cover) at full over- or under-feed,
   * kg/day. A well-fed Angus cow can put on ~0.5 kg/day of soft tissue;
   * a severely underfed cow can lose at a similar rate.
   */
  conditionRateKgPerDay: 0.5,

  /** Hard floor on weight: cow cannot fall below 45% of age-expected weight. */
  minWeightFractionOfExpected: 0.45,

  /** Hard ceiling on weight: cow cannot exceed 120% of age-expected weight. */
  maxWeightFractionOfExpected: 1.2,

  /**
   * Age at which skeletal frame growth is complete (~2 years for beef cattle).
   * After this, extra nutrition goes to condition (fat/muscle) rather than
   * frame, and expectedWeightForAge becomes constant at matureWeightKg.
   */
  maturityDays: 730,

  /**
   * Birth weight as a fraction of mature weight.
   * A 550 kg Angus cow produces a ~35 kg calf → 35/550 ≈ 0.064.
   * Reference: Angus breed averages, Beef Improvement Federation guidelines.
   */
  birthWeightFraction: 0.064,

  /**
   * Sensitivity of BCS to weight ratio: BCS = 5 + (weightRatio - 1) * 12.
   * At 12, a cow 25% underweight scores BCS ~2; 20% overweight scores BCS ~7.
   * Calibrated to match the standard 1–9 scale's clinical descriptions.
   */
  bcsSensitivity: 12,

  /**
   * Per-hour rate at which health converges toward the BCS-derived target.
   * At 0.004, health lags about 10 days behind a sudden condition change —
   * chronic stress accumulates gradually rather than killing instantly.
   */
  healthDriftRate: 0.004,
};

// ─── COWS — LIFECYCLE ────────────────────────────────────────────────────────

export const COW_LIFECYCLE = {
  /** Calf transitions to juvenile at 90 days (approximately weaning age). */
  calfToJuvenileDays: 90,

  /** Juvenile transitions to breeding at 730 days (~2 years, sexual maturity for beef cattle). */
  juvenileToBreedingDays: 730,

  /** Breeding transitions to old at 8 years (productive lifespan for a beef cow). */
  breedingToOldDays: 365 * 8,

  /**
   * Cattle gestation: 283 days on average (range 279–290 days across breeds).
   * Reference: Beef Improvement Federation, Guidelines for Uniform Beef
   * Improvement Programs.
   */
  gestationDays: 283,

  /**
   * Average time for an eligible cow at full fertility and health to conceive,
   * expressed in years. Spreads conception probability across ~0.3 years
   * (~110 days) rather than a fixed window, producing natural variation.
   */
  conceptionWindowYears: 0.3,

  /**
   * A well-fed cow can breed slightly above her base fertility.
   * Caps the nutrition modifier in the hourly conception probability.
   */
  nutritionModifierCap: 1.2,

  /** Calves are born at 6.4% of their mother's mature weight (same as birthWeightFraction). */
  calfBirthWeightFraction: 0.064,

  /** Baseline fertility for a newborn calf — will improve as she reaches breeding age. */
  calfBaseFertility: 0.8,

  /** Calves are born healthy; health degrades only under nutritional stress. */
  calfBaseHealth: 0.9,
};

// ─── COWS — MORTALITY ────────────────────────────────────────────────────────

export const COW_MORTALITY = {
  /**
   * Years past breedingToOldDays before old-age death risk begins.
   * A cow reaches "old" status at 8 years; death risk starts at 12 years,
   * scaling up from there. Gives well-managed cows a realistic productive
   * lifespan without guaranteed death at a fixed age.
   */
  oldAgeExtraYears: 4,

  /**
   * Base hourly death risk at one year past oldAgeDays (excessYears=1).
   * At 0.0002/hour, expected lifespan past that point is ~5,000 hours (~7
   * months) at minimum — rising further as excessYears increases.
   */
  oldAgeBaseRiskPerHour: 0.0002,

  /**
   * Body condition score below which malnutrition death checks begin.
   * BCS 3 is clinically "thin" — visible ribs, poor muscling. Below this,
   * the animal is drawing on structural protein reserves, which is life-
   * threatening over time.
   */
  malnutritionBcsThreshold: 3,

  /**
   * Hourly death risk per unit of BCS severity below the threshold.
   * At BCS 2 (severity=1): 0.0004/hour → expected survival ~2,500 hours
   * (~3.5 months). At BCS 1 (severity=2): 0.0008/hour → ~1,250 hours.
   * Calibrated so chronic malnutrition kills over months, not overnight.
   */
  malnutritionRiskPerHour: 0.0004,

  /**
   * Background hourly risk from disease, injury, or accident (combined).
   * At 0.000005/hour, the expected annual probability for one cow is ~4%.
   * Across a 10-cow herd over 10 years, expect ~4 random deaths — rare but
   * not absent.
   */
  diseaseBaseRiskPerHour: 0.000005,
};

// ─── WEATHER — SEASONAL BASELINES ────────────────────────────────────────────

/**
 * Temperate grassland climate placeholder — not modeling any real location.
 * Calibrated so the annual curve shows clear spring flush, summer dry stress,
 * fall moisture return, and winter dormancy. All four seasons are 90 days
 * (game calendar, not real calendar) for tuning simplicity.
 *
 * stdDev on rainfall is high relative to mean — dry days are common,
 * occasional heavy rain events push the mean up. Realistic for many
 * grassland climates.
 */
export type SeasonalBaseline = {
  temperatureC: { mean: number; stdDev: number };
  rainfallMm: { mean: number; stdDev: number };
  sunlightHours: { mean: number; stdDev: number };
};

export const SEASONAL_BASELINES: Record<Season, SeasonalBaseline> = {
  spring: {
    temperatureC: { mean: 14, stdDev: 3 },
    rainfallMm: { mean: 3, stdDev: 4 },
    sunlightHours: { mean: 7, stdDev: 1.5 },
  },
  summer: {
    temperatureC: { mean: 24, stdDev: 3 },
    rainfallMm: { mean: 1.5, stdDev: 3 },
    sunlightHours: { mean: 9, stdDev: 1 },
  },
  fall: {
    temperatureC: { mean: 13, stdDev: 3 },
    rainfallMm: { mean: 3.5, stdDev: 4 },
    sunlightHours: { mean: 6, stdDev: 1.5 },
  },
  winter: {
    temperatureC: { mean: 4, stdDev: 4 },
    rainfallMm: { mean: 2.5, stdDev: 3 },
    sunlightHours: { mean: 4, stdDev: 1 },
  },
};

/** Hard ceiling on generated sunlight hours per day (physical maximum). */
export const MAX_SUNLIGHT_HOURS = 14;

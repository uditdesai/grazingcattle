import type { Cow, PastureCell } from "@grazingcattle/game-types";

/**
 * Real-world ranching rule of thumb: cattle eat ~2.5% of body weight in dry
 * matter forage per day. This is the actual unit ranchers use to size herds
 * to land (Animal Unit Month).
 */
export const DAILY_INTAKE_FRACTION_OF_BODYWEIGHT = 0.025;

/**
 * "Take half, leave half": real rangeland guideline is to graze roughly
 * 25–50% of standing forage (up to ~75% on improved pasture), leaving
 * enough leaf for photosynthesis/regrowth. Above this, the plant draws
 * down root-stored energy and roots stop growing.
 */
export const UTILIZATION_THRESHOLD = 0.5;

/**
 * How sharply rootHealth is penalized per unit of over-utilization above
 * the threshold. Tunable; revisited in Step 6.
 */
const ROOT_HEALTH_PENALTY_FACTOR = 0.4;

/** How quickly rootHealth recovers per hour when utilization stays at/under threshold. */
const ROOT_HEALTH_RECOVERY_PER_HOUR = 0.0015;

export type GrazingResult = {
  cell: PastureCell;
  /** Dry matter removed from this cell this hour, kg DM/ha. */
  biomassRemovedKgHa: number;
  /** Fraction of the cell's pre-grazing biomass that was removed. */
  utilization: number;
};

/**
 * One cell's grass intake for one hour, given the cows currently grazing it.
 * Splits total hourly demand evenly across the cows present, removes it
 * from the cell, and applies the root-health penalty/recovery.
 */
export function grazeOneCellOneHour(
  cell: PastureCell,
  cowsInCell: Cow[],
  simHour: number,
): GrazingResult {
  const biomassBeforeGrazing = cell.grassBiomassKgHa;

  const totalHourlyDemandKg = cowsInCell.reduce((sum, cow) => {
    const dailyIntakeKg = cow.weightKg * DAILY_INTAKE_FRACTION_OF_BODYWEIGHT;
    return sum + dailyIntakeKg / 24;
  }, 0);

  // Demand is per-cow (kg), but biomass is per-hectare — the cell itself
  // implicitly represents "however much land this grid square is." For
  // Milestone 1 we treat each cell as ~1 hectare, so kg and kg/ha are
  // numerically interchangeable here.
  const biomassRemovedKgHa = Math.min(biomassBeforeGrazing, totalHourlyDemandKg);
  const utilization = biomassBeforeGrazing > 0 ? biomassRemovedKgHa / biomassBeforeGrazing : 0;

  const grassBiomassKgHa = biomassBeforeGrazing - biomassRemovedKgHa;

  let rootHealth = cell.rootHealth;
  if (utilization > UTILIZATION_THRESHOLD) {
    const overage = utilization - UTILIZATION_THRESHOLD;
    rootHealth = Math.max(0, rootHealth - overage * ROOT_HEALTH_PENALTY_FACTOR);
  } else if (cowsInCell.length === 0) {
    // Resting: no cows present at all lets roots recover fastest.
    rootHealth = Math.min(1, rootHealth + ROOT_HEALTH_RECOVERY_PER_HOUR);
  } else {
    // Grazed but within the sustainable threshold: mild recovery.
    rootHealth = Math.min(1, rootHealth + ROOT_HEALTH_RECOVERY_PER_HOUR * 0.3);
  }

  const cellAfterGrazing: PastureCell = {
    ...cell,
    grassBiomassKgHa,
    rootHealth,
    lastGrazedAt: cowsInCell.length > 0 ? simHour : cell.lastGrazedAt,
  };

  return { cell: cellAfterGrazing, biomassRemovedKgHa, utilization };
}

import type { Cow, PastureCell } from "@grazingcattle/game-types";

/** Fraction of grazed dry matter that returns to the cell as manure nutrients. */
const MANURE_NUTRIENT_RETURN_FACTOR = 0.35;
/** How much a full manure deposit raises the 0–1 nutrients bucket. */
const NUTRIENT_DEPOSIT_SCALE = 0.0008;
/** Nutrients slowly deplete even without grazing (uptake by growing grass). */
const NUTRIENT_BASE_DECAY_PER_HOUR = 0.00005;

/**
 * Soil health responds non-monotonically to grazing intensity: light/
 * moderate grazing stimulates it (manure, disturbance, root turnover),
 * heavy grazing degrades it, and once degraded, rest is the most
 * effective recovery path. Modeled as a target soil health for the
 * current utilization level, which soilHealth drifts toward each hour.
 */
const SOIL_HEALTH_DRIFT_RATE_PER_HOUR = 0.0006;

/**
 * depletion (0 = full standing crop, 1 = bare) -> the soil-health level it
 * pulls toward.
 *
 * Asymmetric bell peaking at moderate use: full rest lands at a good-but-
 * not-best 0.84, moderate grazing at 1.0, and heavy use falls away sharply.
 * The asymmetry is the point — rest heals degraded land but never beats
 * well-managed moderate grazing, so resting is not strictly dominant.
 */
function targetSoilHealthForDepletion(depletion: number): number {
  const moderateUsePeak = 0.3;
  const spread = depletion < moderateUsePeak ? 0.5 : 0.25;
  const distance = (depletion - moderateUsePeak) / spread;
  return Math.exp(-0.5 * distance * distance);
}

export function updateSoilHealthOneHour(cell: PastureCell, depletion: number): PastureCell {
  const target = targetSoilHealthForDepletion(depletion);
  const soilHealth =
    cell.soilHealth + (target - cell.soilHealth) * SOIL_HEALTH_DRIFT_RATE_PER_HOUR;

  return { ...cell, soilHealth: Math.max(0, Math.min(1, soilHealth)) };
}

/**
 * Manure deposit from cows grazing this cell this hour: nutrients return
 * proportional to how much they ate, minus base uptake by the grass itself.
 */
export function depositManureOneHour(
  cell: PastureCell,
  cowsInCell: Cow[],
  biomassRemovedKgHa: number,
  simHour: number,
): PastureCell {
  const nutrientsFromManure =
    biomassRemovedKgHa * MANURE_NUTRIENT_RETURN_FACTOR * NUTRIENT_DEPOSIT_SCALE;

  const nutrients = Math.max(
    0,
    Math.min(1, cell.nutrients + nutrientsFromManure - NUTRIENT_BASE_DECAY_PER_HOUR),
  );

  return {
    ...cell,
    nutrients,
    lastManuredAt: cowsInCell.length > 0 ? simHour : cell.lastManuredAt,
  };
}

/**
 * Biodiversity moves slowly and rewards sustained good management: it
 * rises when soil health is good and grazing isn't extreme, falls under
 * chronic overgrazing or chronic total rest (monoculture risk either way).
 */
const BIODIVERSITY_DRIFT_RATE_PER_HOUR = 0.00003;

export function updateBiodiversityOneHour(cell: PastureCell, depletion: number): PastureCell {
  const inHealthyRange = depletion > 0.15 && depletion < 0.55;
  const target = cell.soilHealth * (inHealthyRange ? 1 : 0.6);

  const biodiversity =
    cell.biodiversity + (target - cell.biodiversity) * BIODIVERSITY_DRIFT_RATE_PER_HOUR;

  return { ...cell, biodiversity: Math.max(0, Math.min(1, biodiversity)) };
}

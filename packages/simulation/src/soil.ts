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

/** utilization (0–1, this hour) -> the soil-health level it pulls toward. */
function targetSoilHealthForUtilization(utilization: number): number {
  // Peaks around utilization ~0.3 (moderate use), degrades toward 0 as
  // utilization approaches 1, and full rest (0) drifts toward a good-but-
  // not-maximal target — rest heals degraded land but doesn't outperform
  // well-managed moderate grazing (avoids "rest is strictly dominant").
  const moderateUsePeak = 0.3;
  const spread = 0.35;
  const distance = (utilization - moderateUsePeak) / spread;
  const bellCurve = Math.exp(-0.5 * distance * distance);
  const restBaseline = 0.75;
  return restBaseline + (1 - restBaseline) * bellCurve;
}

export function updateSoilHealthOneHour(cell: PastureCell, utilization: number): PastureCell {
  const target = targetSoilHealthForUtilization(utilization);
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

export function updateBiodiversityOneHour(cell: PastureCell, utilization: number): PastureCell {
  const inHealthyRange = utilization > 0.1 && utilization < 0.6;
  const target = cell.soilHealth * (inHealthyRange ? 1 : 0.6);

  const biodiversity =
    cell.biodiversity + (target - cell.biodiversity) * BIODIVERSITY_DRIFT_RATE_PER_HOUR;

  return { ...cell, biodiversity: Math.max(0, Math.min(1, biodiversity)) };
}

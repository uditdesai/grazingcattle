import type { Cow, PastureCell } from "@grazingcattle/game-types";
import { SOIL } from "./constants";

// ---------------------------------------------------------------------------
// PLAIN-ENGLISH OVERVIEW
//
// Three slow-moving stats live here, all 0-1:
//   - soilHealth: reacts fastest of the three. Every hour it drifts a
//     little toward a "target" value that depends on how hard the land was
//     just grazed (see targetSoilHealthForDepletion) — moderate grazing is
//     actually the BEST target, not resting completely.
//   - nutrients: rises when cows graze (their manure returns nutrients to
//     the soil) and slowly falls otherwise (the growing grass uses them up).
//   - biodiversity: the slowest of all three, rewards staying in a
//     "healthy range" of grazing intensity over a long time — neither
//     hammered nor completely untouched.
// ---------------------------------------------------------------------------

/**
 * depletion (0 = full standing crop, 1 = bare) -> the soil-health level it
 * pulls toward.
 *
 * Asymmetric bell peaking at moderate use: full rest lands at a good-but-
 * not-best target, moderate grazing at 1.0, and heavy use falls away sharply.
 * The asymmetry is the point — rest heals degraded land but never beats
 * well-managed moderate grazing, so resting is not strictly dominant.
 */
const targetSoilHealthForDepletion = (depletion: number): number => {
  // Plain English: depletion = 0 means "untouched, full grass". depletion =
  // moderateUsePeakDepletion (0.3) means "grazed down to 70% of max" — that's
  // the sweet spot, target = 1.0 (best possible). Move away from 0.3 in EITHER
  // direction (too little disturbance OR too much) and the target drops. The
  // drop-off is gentler toward "less grazed" than toward "more grazed" —
  // overgrazing punishes soil health faster than resting does.
  const spread =
    depletion < SOIL.moderateUsePeakDepletion
      ? SOIL.moderateUseSpreadLow
      : SOIL.moderateUseSpreadHigh;
  const distance = (depletion - SOIL.moderateUsePeakDepletion) / spread;
  return Math.exp(-0.5 * distance * distance);
};

export const updateSoilHealthOneHour = (cell: PastureCell, depletion: number): PastureCell => {
  const target = targetSoilHealthForDepletion(depletion);
  // Don't jump straight to the target — nudge soilHealth a small step
  // toward it each hour. This is why soil health changes gradually over
  // weeks/months even though grazing intensity can change hour to hour.
  const soilHealth =
    cell.soilHealth + (target - cell.soilHealth) * SOIL.healthDriftRatePerHour;

  return { ...cell, soilHealth: Math.max(0, Math.min(1, soilHealth)) };
};

/**
 * Manure deposit from cows grazing this cell this hour: nutrients return
 * proportional to how much they ate, minus base uptake by the grass itself.
 */
export const depositManureOneHour = (
  cell: PastureCell,
  cowsInCell: Cow[],
  biomassRemovedKgHa: number,
  simHour: number,
): PastureCell => {
  // The more grass cows ate here this hour, the more manure they leave
  // behind — nutrients cycle back into the soil rather than just vanishing.
  const nutrientsFromManure =
    biomassRemovedKgHa * SOIL.manureNutrientReturnFactor * SOIL.nutrientDepositScale;

  const nutrients = Math.max(
    0,
    Math.min(1, cell.nutrients + nutrientsFromManure - SOIL.nutrientBaseDecayPerHour),
  );

  return {
    ...cell,
    nutrients,
    lastManuredAt: cowsInCell.length > 0 ? simHour : cell.lastManuredAt,
  };
};

/**
 * Biodiversity moves slowly and rewards sustained good management: it
 * rises when soil health is good and grazing isn't extreme, falls under
 * chronic overgrazing or chronic total rest (monoculture risk either way).
 */
export const updateBiodiversityOneHour = (cell: PastureCell, depletion: number): PastureCell => {
  // Same "sweet spot" idea as soil health, but simpler: is this hour's
  // grazing intensity inside a healthy window (not too light, not too
  // heavy)? If so, biodiversity can climb all the way up to match soil
  // health; if not, it's capped lower even if soil health itself is fine.
  const inHealthyRange =
    depletion > SOIL.biodiversityHealthyDepletionMin &&
    depletion < SOIL.biodiversityHealthyDepletionMax;
  const target = cell.soilHealth * (inHealthyRange ? 1 : SOIL.biodiversityOutOfRangeCap);

  const biodiversity =
    cell.biodiversity + (target - cell.biodiversity) * SOIL.biodiversityDriftRatePerHour;

  return { ...cell, biodiversity: Math.max(0, Math.min(1, biodiversity)) };
};

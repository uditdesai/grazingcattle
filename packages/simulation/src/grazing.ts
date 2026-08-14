import type { Cow, PastureCell } from "@grazingcattle/game-types";

/**
 * Real-world ranching rule of thumb: cattle eat ~2.5% of body weight in dry
 * matter forage per day. This is the actual unit ranchers use to size herds
 * to land (Animal Unit Month).
 */
export const DAILY_INTAKE_FRACTION_OF_BODYWEIGHT = 0.025;

/**
 * "Take half, leave half", expressed as a STATE rather than a flow.
 *
 * The rangeland guideline says to leave ~half the forage standing so the
 * plant keeps enough leaf area to photosynthesise. Measuring that as
 * "fraction removed this hour" is a category error: standing biomass is a
 * stock (~2000 kg DM/ha) while intake is a small flow (~11 kg/cow/day), so
 * an hourly ratio is always near zero and the rule can never fire.
 *
 * The equivalent, and the form actual grazing management uses, is a
 * critical residual: keep standing biomass above ~half of what the site can
 * carry. Below that, the plant draws on root reserves and root growth stops.
 * This works identically for rotational and continuous grazing.
 */
export const CRITICAL_RESIDUAL_FRACTION = 0.5;

/** Root health lost per hour at maximum shortfall (biomass at zero). */
const ROOT_HEALTH_PENALTY_PER_HOUR = 0.002;
/** Root health regained per hour whenever biomass sits above the residual. */
const ROOT_HEALTH_RECOVERY_PER_HOUR = 0.0006;

/**
 * Half-saturation constant (kg DM/ha) for sward-limited intake. Cattle
 * cannot maintain full bite rate on a short sward even when total forage
 * exists, so intake falls off as standing biomass declines.
 */
const INTAKE_HALF_SATURATION_KG_HA = 600;

export type CellGrazingOutcome = {
  cell: PastureCell;
  /** Dry matter removed from this cell this hour, kg DM/ha. */
  biomassRemovedKgHa: number;
  /**
   * How far this cell is drawn down from its own ceiling, 0–1
   * (0 = full standing crop, 1 = bare). The grazing-intensity signal
   * soil health and biodiversity respond to.
   */
  depletion: number;
};

export type PaddockGrazingResult = {
  cells: CellGrazingOutcome[];
  /** Forage (kg) each cow actually got this hour — may be below what it needed. */
  forageReceivedPerCow: Map<string, number>;
};

/**
 * Fraction of potential intake achievable on a sward of the given biomass,
 * normalised so a full standing crop yields 1.0. Michaelis-Menten form,
 * the standard shape in grazing models.
 */
function swardAvailabilityFactor(biomassKgHa: number, maxBiomassKgHa: number): number {
  const atBiomass = biomassKgHa / (biomassKgHa + INTAKE_HALF_SATURATION_KG_HA);
  const atMax = maxBiomassKgHa / (maxBiomassKgHa + INTAKE_HALF_SATURATION_KG_HA);
  return atMax > 0 ? Math.min(1, atBiomass / atMax) : 0;
}

/**
 * Grazes an entire paddock for one hour.
 *
 * Herd demand is computed once for the whole paddock (cows roam it; they do
 * not each re-eat a full herd's worth in every cell), limited by what the
 * sward can actually deliver, then distributed across cells in proportion
 * to available biomass.
 */
export function grazePaddockOneHour(
  cellsInPaddock: PastureCell[],
  cowsInPaddock: Cow[],
  simHour: number,
): PaddockGrazingResult {
  const forageReceivedPerCow = new Map<string, number>();

  if (cellsInPaddock.length === 0) {
    return { cells: [], forageReceivedPerCow };
  }

  const totalAvailableBiomassKg = cellsInPaddock.reduce(
    (sum, cell) => sum + cell.grassBiomassKgHa,
    0,
  );
  const meanBiomassKgHa = totalAvailableBiomassKg / cellsInPaddock.length;
  const meanMaxBiomassKgHa =
    cellsInPaddock.reduce((sum, cell) => sum + cell.maxBiomassKgHa, 0) / cellsInPaddock.length;

  // Each cow's intake is capped by sward availability, so a grazed-down
  // paddock starves the herd even while some grass technically remains.
  const availabilityFactor = swardAvailabilityFactor(meanBiomassKgHa, meanMaxBiomassKgHa);

  let totalDemandKg = 0;
  for (const cow of cowsInPaddock) {
    const potentialHourlyIntakeKg = (cow.weightKg * DAILY_INTAKE_FRACTION_OF_BODYWEIGHT) / 24;
    const actualHourlyIntakeKg = potentialHourlyIntakeKg * availabilityFactor;
    forageReceivedPerCow.set(cow.id, actualHourlyIntakeKg);
    totalDemandKg += actualHourlyIntakeKg;
  }

  const totalBiomassRemoved = Math.min(totalAvailableBiomassKg, totalDemandKg);

  const cells: CellGrazingOutcome[] = cellsInPaddock.map((cell) => {
    const share = totalAvailableBiomassKg > 0 ? cell.grassBiomassKgHa / totalAvailableBiomassKg : 0;
    const cellRemoved = totalBiomassRemoved * share;
    const biomassAfter = Math.max(0, cell.grassBiomassKgHa - cellRemoved);

    const residual = cell.maxBiomassKgHa * CRITICAL_RESIDUAL_FRACTION;
    let rootHealth = cell.rootHealth;
    if (biomassAfter < residual) {
      const shortfall = (residual - biomassAfter) / residual;
      rootHealth = Math.max(0, rootHealth - shortfall * ROOT_HEALTH_PENALTY_PER_HOUR);
    } else {
      rootHealth = Math.min(1, rootHealth + ROOT_HEALTH_RECOVERY_PER_HOUR);
    }

    const depletion =
      cell.maxBiomassKgHa > 0 ? Math.max(0, 1 - biomassAfter / cell.maxBiomassKgHa) : 1;

    return {
      cell: {
        ...cell,
        grassBiomassKgHa: biomassAfter,
        rootHealth,
        lastGrazedAt: cellRemoved > 0 ? simHour : cell.lastGrazedAt,
      },
      biomassRemovedKgHa: cellRemoved,
      depletion,
    };
  });

  return { cells, forageReceivedPerCow };
}

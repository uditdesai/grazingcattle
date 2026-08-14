import type { Cow, PastureCell } from "@grazingcattle/game-types";

// ---------------------------------------------------------------------------
// PLAIN-ENGLISH OVERVIEW
//
// This file answers one question per paddock, per hour: "given the cows
// standing here right now, how much grass do they eat, and what does that
// do to the land?" It does three things in order:
//   1. Figures out how much the herd actually manages to eat this hour
//      (capped by how much grass is actually there to bite — see
//      swardAvailabilityFactor).
//   2. Spreads that removal across the paddock's cells, weighted by how
//      much grass each cell has (lusher cells get grazed more).
//   3. Checks whether the remaining grass in each cell dropped below the
//      "critical residual" (half of what that cell could carry) — if so,
//      the roots take damage, which slows future regrowth in grass.ts.
// This is the file where the game's core lesson lives: leave enough grass
// standing, or the land gets measurably worse and stays worse.
//
// NOTE: see the big comment on CRITICAL_RESIDUAL_FRACTION below for a real
// bug we hit here — an early version measured overgrazing "per hour" instead
// of "over the whole grazing period", which made the overgrazing penalty
// completely unreachable no matter how many cows you added.
// ---------------------------------------------------------------------------

/**
 * Real-world ranching rule of thumb: cattle eat ~2.5% of body weight in dry
 * matter forage per day. This is the actual unit ranchers use to size herds
 * to land (Animal Unit Month).
 */
export const DAILY_INTAKE_FRACTION_OF_BODYWEIGHT = 0.025;

/**
 * "Take half, leave half", expressed as a STATE rather than a flow.
 *
 * ===========================================================================
 * BUG WE HIT AND FIXED: measuring utilization "per hour" instead of "over
 * the whole time cows are on this paddock".
 * ===========================================================================
 *
 * The rangeland guideline is: over a full grazing period (a rotational herd
 * might occupy a paddock for, say, two weeks), don't let the herd remove
 * more than about half of what was standing when they arrived. That's a
 * comparison between two SNAPSHOTS taken potentially weeks apart.
 *
 * The first version of this code instead checked, every single hour:
 * "what fraction of the grass THAT'S STANDING RIGHT NOW got eaten in the
 * LAST HOUR?" That sounds like the same idea but it isn't — it mixes up a
 * stock (how much grass is on the ground right now, ~2,000 kg DM/ha) with a
 * flow (how much a cow eats in one hour, ~0.47 kg). Even 40 cows only eat
 * about 0.06% of a paddock's standing grass in a single hour. No matter how
 * badly overstocked a farm was, that hourly ratio never got anywhere close
 * to 50% — the whole "overgrazing damages the land" mechanic was silently
 * dead code. We proved this with a 240-cow stress test that still showed
 * ZERO root damage after 10 days.
 *
 * The fix: stop asking "what fraction disappeared in the last hour?" and
 * instead ask "is what's currently standing above or below half of what
 * this land could carry?" (see CRITICAL_RESIDUAL_FRACTION below). That's a
 * single comparison against a fixed line, re-checked every hour, so it
 * doesn't need to remember "when did the herd arrive" or track a running
 * total across a multi-week grazing bout — but it produces the same
 * real-world behavior: graze a paddock down past the halfway mark (whether
 * that takes one day or two weeks) and root health starts taking damage
 * immediately, every hour it stays below that line.
 *
 * Below that residual line, the plant draws on root reserves and root
 * growth stops. This works identically for rotational and continuous
 * grazing, and needs no extra state (no "when did cows arrive" tracking).
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
 *
 * Plain English: a cow on lush, tall grass can eat as much as it wants
 * (factor near 1). A cow on a nearly-bare paddock physically can't take big
 * enough bites even if some grass technically remains — this factor drops
 * toward 0 as biomass shrinks, curbing how much the herd is ALLOWED to eat
 * this hour (as opposed to how much they'd like to eat).
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

  // Step 1: how much grass does this whole paddock have right now, and
  // how does that compare to what a healthy, ungrazed paddock could carry?
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

  // Step 2: add up what every cow in this paddock actually manages to eat
  // this hour (each cow's normal appetite, scaled down by availabilityFactor
  // if the paddock is grazed thin). This total is what gets removed from
  // the land, and forageReceivedPerCow is handed back to cows.ts so it can
  // update each cow's weight based on what IT personally got to eat.
  let totalDemandKg = 0;
  for (const cow of cowsInPaddock) {
    const potentialHourlyIntakeKg = (cow.weightKg * DAILY_INTAKE_FRACTION_OF_BODYWEIGHT) / 24;
    const actualHourlyIntakeKg = potentialHourlyIntakeKg * availabilityFactor;
    forageReceivedPerCow.set(cow.id, actualHourlyIntakeKg);
    totalDemandKg += actualHourlyIntakeKg;
  }

  // Never remove more than physically exists in the paddock.
  const totalBiomassRemoved = Math.min(totalAvailableBiomassKg, totalDemandKg);

  // Step 3: spread that total removal across the paddock's individual
  // cells, then check each cell against the critical residual line.
  const cells: CellGrazingOutcome[] = cellsInPaddock.map((cell) => {
    // This cell's "fair share" of the total grazing, proportional to how
    // much grass it had relative to the rest of the paddock — cells with
    // more grass get grazed harder, exactly like real cattle preferring
    // the lusher patches.
    const share = totalAvailableBiomassKg > 0 ? cell.grassBiomassKgHa / totalAvailableBiomassKg : 0;
    const cellRemoved = totalBiomassRemoved * share;
    const biomassAfter = Math.max(0, cell.grassBiomassKgHa - cellRemoved);

    // THE CORE OVERGRAZING CHECK. residual = half of what this cell could
    // carry at full health. If what's left after grazing falls below that
    // line, the plant is being forced to eat into its root reserves instead
    // of just its leaves — so rootHealth takes damage, proportional to how
    // far below the line we are (a small dip barely hurts; grazing to bare
    // dirt hurts a lot). Staying above the line lets roots slowly recover.
    const residual = cell.maxBiomassKgHa * CRITICAL_RESIDUAL_FRACTION;
    let rootHealth = cell.rootHealth;
    if (biomassAfter < residual) {
      const shortfall = (residual - biomassAfter) / residual;
      rootHealth = Math.max(0, rootHealth - shortfall * ROOT_HEALTH_PENALTY_PER_HOUR);
    } else {
      rootHealth = Math.min(1, rootHealth + ROOT_HEALTH_RECOVERY_PER_HOUR);
    }

    // depletion is just "how drawn-down is this cell, as a fraction of its
    // own ceiling" — 0 means full standing crop, 1 means bare dirt. soil.ts
    // uses this number to decide whether soil health should rise or fall.
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

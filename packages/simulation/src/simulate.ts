import type { Cow, FarmEvent, FarmState, PastureCell } from "@grazingcattle/game-types";
import { growGrassOneHour, updateSoilMoistureOneHour } from "./grass";
import { grazePaddockOneHour, type CellGrazingOutcome } from "./grazing";
import {
  ageCowOneHour,
  checkBirthOneHour,
  checkBreedingOneHour,
  checkDeathOneHour,
  updateCowConditionOneHour,
  updateCowWeightOneHour,
} from "./cows";
import { depositManureOneHour, updateBiodiversityOneHour, updateSoilHealthOneHour } from "./soil";
import { generateWeather, seasonForDay } from "./weather";

// ---------------------------------------------------------------------------
// PLAIN-ENGLISH OVERVIEW
//
// This is the file that actually calls everything in grass.ts, grazing.ts,
// soil.ts, and cows.ts, in order, once per simulated hour. If you want to
// know "what happens during one tick of the game clock", this is the file
// that answers it end to end. Roughly:
//   1. Figure out the weather and season for this hour.
//   2. For each PADDOCK, work out how much the herd there eats and what
//      that does to the land (grazePaddockOneHour).
//   3. For each CELL, on top of that grazing outcome: let grass regrow,
//      update soil health/nutrients/biodiversity.
//   4. For each COW: update weight/condition from what it ate, age it by
//      an hour, check for breeding/birth/death.
// Every function called here is "pure" — it takes today's state and
// returns tomorrow's state, without secretly reading the clock or reaching
// into a database. That's what makes it safe to replay the exact same
// farm-seed forward and always get the exact same result.
// ---------------------------------------------------------------------------

export type SimulationResult = {
  farm: FarmState;
  events: FarmEvent[];
};

/**
 * Advances a farm from its current simHour forward by `hours` hours.
 * Pure: no I/O, no Date.now(), no unseeded randomness. This is the exact
 * function both the CLI harness and (in Milestone 2) the catch-up
 * simulation on login call — same signature either way.
 */
export function simulateFarm(farm: FarmState, hours: number): SimulationResult {
  let current = farm;
  const events: FarmEvent[] = [];

  for (let i = 0; i < hours; i++) {
    current = simulateOneHour(current, events);
  }

  return { farm: current, events };
}

function simulateOneHour(farm: FarmState, events: FarmEvent[]): FarmState {
  const simHour = farm.simHour;
  const isStartOfDay = simHour % 24 === 0;

  // Weather only gets rolled once per day (at hour 0, 24, 48, ...) — every
  // other hour of the day just reuses that same day's weather reading.
  const weatherToday = isStartOfDay ? generateWeather(farm.seed, simHour) : farm.weatherToday;
  const season = seasonForDay(Math.floor(simHour / 24));
  if (season !== farm.season) {
    events.push({
      id: `evt_season_${simHour}`,
      farmId: farm.id,
      simHour,
      type: "SEASON_CHANGED",
      data: { season },
    });
  }

  // Group live cows by their current paddock so grazing is computed once
  // per paddock, not once per cell.
  const liveCows = farm.cows.filter(
    (cow) => cow.status !== "dead" && cow.status !== "sold" && cow.status !== "slaughtered",
  );
  const cowsByPaddockId = groupCowsByPaddock(liveCows, farm.paddocks);
  const cellsById = new Map(farm.cells.map((cell) => [cell.id, cell]));
  const cellIdToPaddockId = new Map<string, string>();
  for (const paddock of farm.paddocks) {
    for (const cellId of paddock.cellIds) cellIdToPaddockId.set(cellId, paddock.id);
  }

  // --- Grazing: one pass per paddock, distributing herd demand across
  // that paddock's cells and splitting intake evenly back across the herd. ---
  // We loop paddock-by-paddock (not cell-by-cell) on purpose: cows roam a
  // whole paddock, and grazePaddockOneHour needs to see the WHOLE herd in
  // a paddock at once to correctly figure out how much they collectively
  // eat. Doing this per-cell instead was the original bug — see grazing.ts.
  const grazingOutcomeByCellId = new Map<string, CellGrazingOutcome>();
  const forageAvailablePerCow = new Map<string, number>();

  for (const paddock of farm.paddocks) {
    const cellsInPaddock = paddock.cellIds
      .map((cellId) => cellsById.get(cellId))
      .filter((cell): cell is PastureCell => cell !== undefined)
      .map((cell) => updateSoilMoistureOneHour(cell, weatherToday));

    const cowsInPaddock = cowsByPaddockId.get(paddock.id) ?? [];
    const paddockResult = grazePaddockOneHour(cellsInPaddock, cowsInPaddock, simHour);

    for (const outcome of paddockResult.cells) {
      grazingOutcomeByCellId.set(outcome.cell.id, outcome);
    }
    for (const [cowId, forage] of paddockResult.forageReceivedPerCow) {
      forageAvailablePerCow.set(cowId, forage);
    }
  }

  // --- Cells: growth, soil health, manure, biodiversity applied on top of
  // this hour's grazing outcome (or passive rest for cells outside any
  // paddock, e.g. unfenced farmland). ---
  const updatedCells: PastureCell[] = farm.cells.map((cell) => {
    const paddockId = cellIdToPaddockId.get(cell.id);
    let outcome = paddockId ? grazingOutcomeByCellId.get(cell.id) : undefined;

    if (!outcome) {
      // Cell outside any paddock (unfenced land): run it through the same
      // grazing pass with no herd so it rests under identical rules.
      const [restedOutcome] = grazePaddockOneHour(
        [updateSoilMoistureOneHour(cell, weatherToday)],
        [],
        simHour,
      ).cells;
      outcome = restedOutcome!;
    }

    const cowsInCell = paddockId ? (cowsByPaddockId.get(paddockId) ?? []) : [];

    let updatedCell = growGrassOneHour(outcome.cell, weatherToday);
    updatedCell = updateSoilHealthOneHour(updatedCell, outcome.depletion);
    updatedCell = depositManureOneHour(updatedCell, cowsInCell, outcome.biomassRemovedKgHa, simHour);
    updatedCell = updateBiodiversityOneHour(updatedCell, outcome.depletion);

    return updatedCell;
  });

  // --- Cows: weight, condition, aging, breeding, birth, death ---
  // Each live cow runs through the same pipeline in order: how much it ate
  // this hour (looked up from forageAvailablePerCow, computed above by the
  // grazing pass) drives its weight, which drives its condition, then it
  // ages by an hour and gets checked for breeding/birth/death.
  const newCalves: Cow[] = [];
  const updatedCows: Cow[] = farm.cows.map((cow) => {
    if (cow.status === "dead" || cow.status === "sold" || cow.status === "slaughtered") {
      return cow;
    }

    const availableForage = forageAvailablePerCow.get(cow.id) ?? 0;

    let updatedCow = updateCowWeightOneHour(cow, availableForage);
    updatedCow = updateCowConditionOneHour(updatedCow);
    updatedCow = ageCowOneHour(updatedCow);
    updatedCow = checkBreedingOneHour(updatedCow, farm.seed, simHour);

    const birthResult = checkBirthOneHour(updatedCow, farm.seed, simHour, farm.id);
    updatedCow = birthResult.mother;
    if (birthResult.calf) newCalves.push(birthResult.calf);
    if (birthResult.event) events.push(birthResult.event);

    const deathEvent = checkDeathOneHour(updatedCow, farm.seed, simHour, farm.id);
    if (deathEvent) {
      events.push(deathEvent);
      updatedCow = { ...updatedCow, status: "dead", exitSimHour: simHour };
    }

    return updatedCow;
  });

  return {
    ...farm,
    simHour: simHour + 1,
    season,
    weatherToday,
    cells: updatedCells,
    cows: [...updatedCows, ...newCalves],
  };
}

function groupCowsByPaddock(
  cows: Cow[],
  paddocks: FarmState["paddocks"],
): Map<string, Cow[]> {
  const validPaddockIds = new Set(paddocks.map((p) => p.id));
  const grouped = new Map<string, Cow[]>();

  for (const cow of cows) {
    if (!cow.currentPaddockId || !validPaddockIds.has(cow.currentPaddockId)) continue;
    const existing = grouped.get(cow.currentPaddockId);
    if (existing) existing.push(cow);
    else grouped.set(cow.currentPaddockId, [cow]);
  }

  return grouped;
}

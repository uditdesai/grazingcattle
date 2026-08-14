import type { Cow, FarmEvent, FarmState, PastureCell } from "@grazingcattle/game-types";
import { growGrassOneHour, updateSoilMoistureOneHour } from "./grass";
import { grazeOneCellOneHour } from "./grazing";
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

  // Group live cows by their current paddock so grazing/manure can be
  // computed per-cell without repeatedly filtering the whole herd.
  const liveCows = farm.cows.filter(
    (cow) => cow.status !== "dead" && cow.status !== "sold" && cow.status !== "slaughtered",
  );
  const cowsByPaddockId = groupCowsByPaddock(liveCows, farm.paddocks);

  const cellsById = new Map(farm.cells.map((cell) => [cell.id, cell]));
  const cellIdToPaddockId = new Map<string, string>();
  for (const paddock of farm.paddocks) {
    for (const cellId of paddock.cellIds) cellIdToPaddockId.set(cellId, paddock.id);
  }

  // --- Cells: moisture, grazing, growth, soil, manure, biodiversity ---
  const forageAvailablePerCow = new Map<string, number>();
  const updatedCells: PastureCell[] = farm.cells.map((cell) => {
    let updatedCell = updateSoilMoistureOneHour(cell, weatherToday);

    const paddockId = cellIdToPaddockId.get(cell.id);
    const cowsInCell = paddockId ? (cowsByPaddockId.get(paddockId) ?? []) : [];

    const grazingResult = grazeOneCellOneHour(updatedCell, cowsInCell, simHour);
    updatedCell = grazingResult.cell;

    if (cowsInCell.length > 0) {
      const forageEach = grazingResult.biomassRemovedKgHa / cowsInCell.length;
      for (const cow of cowsInCell) forageAvailablePerCow.set(cow.id, forageEach);
    }

    updatedCell = growGrassOneHour(updatedCell, weatherToday);
    updatedCell = updateSoilHealthOneHour(updatedCell, grazingResult.utilization);
    updatedCell = depositManureOneHour(
      updatedCell,
      cowsInCell,
      grazingResult.biomassRemovedKgHa,
      simHour,
    );
    updatedCell = updateBiodiversityOneHour(updatedCell, grazingResult.utilization);

    return updatedCell;
  });

  // --- Cows: weight, condition, aging, breeding, birth, death ---
  const newCalves: Cow[] = [];
  const updatedCows: Cow[] = farm.cows.map((cow) => {
    if (cow.status === "dead" || cow.status === "sold" || cow.status === "slaughtered") {
      return cow;
    }

    const previousWeightKg = cow.weightKg;
    const availableForage = forageAvailablePerCow.get(cow.id) ?? 0;

    let updatedCow = updateCowWeightOneHour(cow, availableForage);
    updatedCow = updateCowConditionOneHour(updatedCow, previousWeightKg);
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

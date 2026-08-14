import type { Cow, FarmState, Paddock, PastureCell } from "@grazingcattle/game-types";
import { generateWeather, seasonForDay } from "./weather";

export type ScenarioName = "sustainable" | "overstocked" | "rotational";

export type Scenario = {
  farm: FarmState;
  /** For rotational scenarios: move the herd to the next paddock every N days. */
  rotationIntervalDays?: number;
};

/** 8x8 grid = 64 cells, split into 4 quadrant paddocks of 16 cells (~16 ha) each. */
const GRID_SIZE = 8;
const QUADRANT_SIZE = GRID_SIZE / 2;

function buildCells(): PastureCell[] {
  const cells: PastureCell[] = [];
  for (let x = 0; x < GRID_SIZE; x++) {
    for (let y = 0; y < GRID_SIZE; y++) {
      cells.push({
        id: `cell_${x}_${y}`,
        x,
        y,
        grassBiomassKgHa: 1800,
        maxBiomassKgHa: 2500,
        rootHealth: 1,
        soilHealth: 0.6,
        soilMoisture: 0.5,
        nutrients: 0.5,
        biodiversity: 0.5,
        lastGrazedAt: null,
        lastManuredAt: null,
      });
    }
  }
  return cells;
}

function quadrantOf(x: number, y: number): number {
  const col = x < QUADRANT_SIZE ? 0 : 1;
  const row = y < QUADRANT_SIZE ? 0 : 1;
  return row * 2 + col;
}

function buildPaddocks(cells: PastureCell[]): Paddock[] {
  const cellIdsByQuadrant: string[][] = [[], [], [], []];
  for (const cell of cells) {
    cellIdsByQuadrant[quadrantOf(cell.x, cell.y)]!.push(cell.id);
  }
  return cellIdsByQuadrant.map((cellIds, i) => ({
    id: `paddock-${i + 1}`,
    name: `Paddock ${i + 1}`,
    cellIds,
  }));
}

function buildCows(count: number, paddockId: string): Cow[] {
  const cows: Cow[] = [];
  for (let i = 0; i < count; i++) {
    cows.push({
      id: `cow_${i}`,
      sex: i % 4 === 0 ? "male" : "female",
      breed: "Angus",
      // Start as young adults (~3 years) so aging into "old" and eventual
      // death is observable within a multi-year run.
      ageDays: 365 * 3,
      matureWeightKg: 550,
      weightKg: 500,
      bodyConditionScore: 5,
      health: 0.9,
      fertility: 0.7,
      pregnant: false,
      status: "breeding",
      currentPaddockId: paddockId,
      birthSimHour: 0,
    });
  }
  return cows;
}

function baseFarm(id: string, name: string, cows: Cow[]): FarmState {
  const cells = buildCells();
  const paddocks = buildPaddocks(cells);
  const seed = id;
  return {
    id,
    name,
    simHour: 0,
    season: seasonForDay(0),
    weatherToday: generateWeather(seed, 0),
    cells,
    paddocks,
    cows,
    moneyUsd: 10000,
    seed,
  };
}

export function buildScenario(name: ScenarioName): Scenario {
  switch (name) {
    case "sustainable": {
      const cows = buildCows(8, "paddock-1");
      return { farm: baseFarm("farm-sustainable", "Sustainable (8 cows, 1 paddock, no rotation)", cows) };
    }
    case "overstocked": {
      const cows = buildCows(40, "paddock-1");
      return { farm: baseFarm("farm-overstocked", "Overstocked (40 cows, 1 paddock, no rotation)", cows) };
    }
    case "rotational": {
      const cows = buildCows(8, "paddock-1");
      return {
        farm: baseFarm("farm-rotational", "Rotational (8 cows, 4 paddocks, 14-day rotation)", cows),
        rotationIntervalDays: 14,
      };
    }
  }
}

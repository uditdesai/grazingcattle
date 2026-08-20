import type { Cow, FarmState, Paddock, PastureCell } from "@grazingcattle/game-types";
import { generateWeather, seasonForDay } from "./weather";

export type ScenarioName = "sustainable" | "overstocked" | "rotational";

export type Scenario = {
  farm: FarmState;
  /** For rotational scenarios: move the herd to the next paddock every N days. */
  rotationIntervalDays?: number;
};

/** 4x4 grid = 16 cells, split into 4 quadrant paddocks of 4 cells (~4 ha) each. */
const GRID_SIZE = 4;
const QUADRANT_SIZE = GRID_SIZE / 2;

// Per-paddock base values give each quadrant a distinct starting character —
// one has lush grass but tired soil, another has recovered roots but sparse
// cover, etc. All are within a similar overall range so no paddock is a
// clear "best choice" at first glance.
const PADDOCK_BASES = [
  { grass: 880,  roots: 0.50, soil: 0.40, moisture: 0.42, nutrients: 0.32, biodiversity: 0.28 },
  { grass: 950,  roots: 0.63, soil: 0.32, moisture: 0.38, nutrients: 0.27, biodiversity: 0.36 },
  { grass: 910,  roots: 0.57, soil: 0.36, moisture: 0.44, nutrients: 0.31, biodiversity: 0.31 },
  { grass: 870,  roots: 0.60, soil: 0.34, moisture: 0.39, nutrients: 0.29, biodiversity: 0.34 },
] as const;

const buildCells = (): PastureCell[] => {
  const cells: PastureCell[] = [];
  for (let x = 0; x < GRID_SIZE; x++) {
    for (let y = 0; y < GRID_SIZE; y++) {
      // Quadrant index inline (quadrantOf isn't defined yet at this point).
      const q = (y < QUADRANT_SIZE ? 0 : 1) * 2 + (x < QUADRANT_SIZE ? 0 : 1);
      const base = PADDOCK_BASES[q]!;
      // Cell-level noise layered on top of the paddock base.
      const v = ((x * 3 + y * 7) % 10) / 100; // 0.00–0.09
      cells.push({
        id: `cell_${x}_${y}`,
        x,
        y,
        grassBiomassKgHa: base.grass + v * 200,
        maxBiomassKgHa: 2500,
        rootHealth:   Math.min(1, base.roots       + v * 0.10),
        soilHealth:   Math.min(1, base.soil        + v * 0.08),
        soilMoisture: Math.min(1, base.moisture    + v * 0.08),
        nutrients:    Math.min(1, base.nutrients   + v * 0.08),
        biodiversity: Math.min(1, base.biodiversity + v * 0.08),
        lastGrazedAt: null,
        lastManuredAt: null,
      });
    }
  }
  return cells;
};

const quadrantOf = (x: number, y: number): number => {
  const col = x < QUADRANT_SIZE ? 0 : 1;
  const row = y < QUADRANT_SIZE ? 0 : 1;
  return row * 2 + col;
};

const buildPaddocks = (cells: PastureCell[]): Paddock[] => {
  const cellIdsByQuadrant: string[][] = [[], [], [], []];
  for (const cell of cells) {
    cellIdsByQuadrant[quadrantOf(cell.x, cell.y)]!.push(cell.id);
  }
  return cellIdsByQuadrant.map((cellIds, i) => ({
    id: `paddock-${i + 1}`,
    name: `Paddock ${i + 1}`,
    cellIds,
  }));
};

const buildCows = (count: number, paddockId: string): Cow[] => {
  const cows: Cow[] = [];
  for (let i = 0; i < count; i++) {
    // Deterministic variation per cow using prime multipliers so no two
    // cows start identical. All values stay within a realistic range.
    const ageDays   = 365 * 2 + (i * 91) % (365 * 3);   // 2–5 years
    const weightKg  = 460 + (i * 17) % 50;               // 460–509 kg → BCS ~3.0–3.9
    const health    = 0.65 + ((i * 7) % 20) / 100;       // 0.65–0.84
    const fertility = 0.50 + ((i * 11) % 20) / 100;      // 0.50–0.69
    const sex: "male" | "female" = i % 4 === 0 ? "male" : "female";

    // BCS is recomputed from weightKg each tick; this initial value is only
    // stored in the DB before the first simulation hour runs.
    const bcs = parseFloat((5 + (weightKg / 550 - 1) * 12).toFixed(1));

    // Cows 2 and 5 start already pregnant so the player sees a calf
    // within the first ~5 real days rather than waiting 30+ days.
    const pregnant = sex === "female" && (i === 2 || i === 5);
    const pregnancyDays = i === 2 ? 140 : i === 5 ? 80 : undefined;

    cows.push({
      id: `cow_${i}`,
      sex,
      breed: "Angus",
      ageDays,
      matureWeightKg: 550,
      weightKg,
      bodyConditionScore: bcs,
      health,
      fertility,
      pregnant,
      pregnancyDays,
      status: "breeding",
      currentPaddockId: paddockId,
      birthSimHour: 0,
    });
  }
  return cows;
};

const baseFarm = (id: string, name: string, cows: Cow[]): FarmState => {
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
};

export const buildScenario = (name: ScenarioName): Scenario => {
  switch (name) {
    case "sustainable": {
      const cows = buildCows(10, "paddock-1");
      return { farm: baseFarm("farm-sustainable", "Sustainable (10 cows, 1 paddock, no rotation)", cows) };
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
};

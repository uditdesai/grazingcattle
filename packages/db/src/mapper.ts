/**
 * Mapper — converts between database rows and the simulation's FarmState.
 *
 * HOW THIS WORKS:
 * The database stores data as flat rows (one cow = one row, 64 cells = 64
 * rows). The simulation works with one big nested object (FarmState with
 * cows[], cells[], paddocks[] inside it). These two shapes don't match,
 * so this file bridges the gap in both directions:
 *
 *   farmRowsToState()  — DB rows → FarmState  (called when loading a farm)
 *   stateToFarmRows()  — FarmState → DB rows  (called when saving after sim)
 *
 * This is the ONLY file that knows about both worlds. The simulation
 * (packages/simulation) stays completely DB-ignorant, and the route handlers
 * just call loadFarm / saveFarm without knowing the SQL details.
 *
 * Think of it like a React component that receives props (DB rows) and
 * renders/returns something (FarmState) — a pure transformation with no
 * side effects of its own.
 */

import type {
  Cow,
  FarmEvent,
  FarmState,
  Paddock,
  PastureCell,
  Weather,
} from "@grazingcattle/game-types";
import type { CowRow, FarmEventRow, FarmRow, PaddockRow, PastureCellRow } from "./schema";

// ─── DB ROWS → FARMSTATE ──────────────────────────────────────────────────────

export const farmRowsToState = (
  farmRow: FarmRow,
  cellRows: PastureCellRow[],
  paddockRows: PaddockRow[],
  cowRows: CowRow[],
): FarmState => {
  return {
    id:           farmRow.id,
    name:         farmRow.name,
    simHour:      farmRow.simHour,
    season:       farmRow.season as FarmState["season"],
    weatherToday: farmRow.weatherToday as Weather,
    moneyUsd:     farmRow.moneyUsd,
    seed:         farmRow.seed,
    cells:        cellRows.map(cellRowToState),
    paddocks:     paddockRows.map(paddockRowToState),
    cows:         cowRows.map(cowRowToState),
  };
};

const cellRowToState = (row: PastureCellRow): PastureCell => ({
  id:                 row.id,
  x:                  row.x,
  y:                  row.y,
  grassBiomassKgHa:   row.grassBiomassKgHa,
  maxBiomassKgHa:     row.maxBiomassKgHa,
  rootHealth:         row.rootHealth,
  soilHealth:         row.soilHealth,
  soilMoisture:       row.soilMoisture,
  nutrients:          row.nutrients,
  biodiversity:       row.biodiversity,
  lastGrazedAt:       row.lastGrazedAt ?? null,
  lastManuredAt:      row.lastManuredAt ?? null,
});

const paddockRowToState = (row: PaddockRow): Paddock => ({
  id:      row.id,
  name:    row.name,
  cellIds: row.cellIds ?? [],
});

const cowRowToState = (row: CowRow): Cow => ({
  id:                 row.id,
  name:               row.name ?? undefined,
  sex:                row.sex as Cow["sex"],
  breed:              row.breed,
  ageDays:            row.ageDays,
  weightKg:           row.weightKg,
  matureWeightKg:     row.matureWeightKg,
  bodyConditionScore: row.bodyConditionScore,
  health:             row.health,
  fertility:          row.fertility,
  pregnant:           row.pregnant,
  pregnancyDays:      row.pregnancyDays ?? undefined,
  status:             row.status as Cow["status"],
  currentPaddockId:   row.currentPaddockId ?? null,
  birthSimHour:       row.birthSimHour,
  exitSimHour:        row.exitSimHour ?? undefined,
});

// ─── FARMSTATE → DB ROWS ──────────────────────────────────────────────────────

export type FarmStateRows = {
  farm:     Omit<FarmRow, "lastSimulatedAt">;
  cells:    PastureCellRow[];
  paddocks: PaddockRow[];
  cows:     CowRow[];
  events:   FarmEventRow[];
};

export const stateToFarmRows = (
  state: FarmState,
  events: FarmEvent[],
): FarmStateRows => ({
  farm: {
    id:           state.id,
    userId:       null,
    name:         state.name,
    simHour:      state.simHour,
    season:       state.season,
    weatherToday: state.weatherToday,
    moneyUsd:     state.moneyUsd,
    seed:         state.seed,
  },
  cells:    state.cells.map(cellStateToRow.bind(null, state.id)),
  paddocks: state.paddocks.map(paddockStateToRow.bind(null, state.id)),
  cows:     state.cows.map(cowStateToRow.bind(null, state.id)),
  events:   events.map(eventToRow.bind(null, state.id)),
});

const cellStateToRow = (farmId: string, cell: PastureCell): PastureCellRow => ({
  id:                 cell.id,
  farmId,
  x:                  cell.x,
  y:                  cell.y,
  grassBiomassKgHa:   cell.grassBiomassKgHa,
  maxBiomassKgHa:     cell.maxBiomassKgHa,
  rootHealth:         cell.rootHealth,
  soilHealth:         cell.soilHealth,
  soilMoisture:       cell.soilMoisture,
  nutrients:          cell.nutrients,
  biodiversity:       cell.biodiversity,
  lastGrazedAt:       cell.lastGrazedAt ?? null,
  lastManuredAt:      cell.lastManuredAt ?? null,
});

const paddockStateToRow = (farmId: string, paddock: Paddock): PaddockRow => ({
  id:      paddock.id,
  farmId,
  name:    paddock.name,
  cellIds: paddock.cellIds,
});

const cowStateToRow = (farmId: string, cow: Cow): CowRow => ({
  id:                 cow.id,
  farmId,
  name:               cow.name ?? null,
  sex:                cow.sex,
  breed:              cow.breed,
  ageDays:            cow.ageDays,
  weightKg:           cow.weightKg,
  matureWeightKg:     cow.matureWeightKg,
  bodyConditionScore: cow.bodyConditionScore,
  health:             cow.health,
  fertility:          cow.fertility,
  pregnant:           cow.pregnant,
  pregnancyDays:      cow.pregnancyDays ?? null,
  status:             cow.status,
  currentPaddockId:   cow.currentPaddockId ?? null,
  birthSimHour:       cow.birthSimHour,
  exitSimHour:        cow.exitSimHour ?? null,
});

const eventToRow = (farmId: string, event: FarmEvent): FarmEventRow => ({
  id:      event.id,
  farmId,
  simHour: event.simHour,
  type:    event.type,
  data:    event.data,
});

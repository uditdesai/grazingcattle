/**
 * Database query functions — the public API of packages/db.
 *
 * HOW THIS WORKS:
 * These are the only functions route handlers need to know about. They hide
 * all the SQL (via Drizzle) and all the row↔FarmState conversion (via
 * mapper.ts) behind two simple operations:
 *
 *   loadFarm(db, farmId)                     → FarmState
 *   saveFarm(db, state, events, simulatedAt) → void
 *   createFarm(db, state)                    → void
 *
 * A route handler's flow is always:
 *   1. const farm = await loadFarm(db, farmId)
 *   2. const { farm: updated, events } = simulateFarm(farm, hours)
 *   3. await saveFarm(db, updated, events, now)
 *   4. return updated + events to the browser
 *
 * Why pass `db` as a parameter instead of importing the client directly?
 * So the same query functions work in both the app (pooler connection) and
 * a future test setup (test DB connection) without changing any code here.
 */

import type { FarmEvent, FarmState } from "@grazingcattle/game-types";
import { eq } from "drizzle-orm";
import type { Db } from "./client";
import { farmRowsToState, stateToFarmRows } from "./mapper";
import { cows, farmEvents, farms, paddocks, pastureCells } from "./schema";

export const loadFarm = async (db: Db, farmId: string): Promise<FarmState | null> => {
  // Run all four selects in parallel — no reason to wait for cells before
  // fetching cows, they're independent queries.
  const [farmRows, cellRows, paddockRows, cowRows] = await Promise.all([
    db.select().from(farms).where(eq(farms.id, farmId)),
    db.select().from(pastureCells).where(eq(pastureCells.farmId, farmId)),
    db.select().from(paddocks).where(eq(paddocks.farmId, farmId)),
    db.select().from(cows).where(eq(cows.farmId, farmId)),
  ]);

  const farmRow = farmRows[0];
  if (!farmRow) return null;

  return farmRowsToState(farmRow, cellRows, paddockRows, cowRows);
};

export const loadFarmLastSimulatedAt = async (
  db: Db,
  farmId: string,
): Promise<Date | null> => {
  const rows = await db
    .select({ lastSimulatedAt: farms.lastSimulatedAt })
    .from(farms)
    .where(eq(farms.id, farmId));
  return rows[0]?.lastSimulatedAt ?? null;
};

export const saveFarm = async (
  db: Db,
  state: FarmState,
  events: FarmEvent[],
  simulatedAt: Date,
): Promise<void> => {
  const rows = stateToFarmRows(state, events);

  // Everything in one transaction: either all rows update or none do.
  // Without a transaction, a crash halfway through could leave the DB in
  // a half-updated state (some old cells, some new cows, etc.).
  await db.transaction(async (tx) => {
    // Update farm-level fields.
    await tx
      .update(farms)
      .set({
        simHour:         rows.farm.simHour,
        lastSimulatedAt: simulatedAt,
        season:          rows.farm.season,
        weatherToday:    rows.farm.weatherToday,
        moneyUsd:        rows.farm.moneyUsd,
      })
      .where(eq(farms.id, state.id));

    // Upsert cells: insert if new, update if existing (calves born mid-
    // session bring new cow rows; cells are fixed but values change).
    if (rows.cells.length > 0) {
      await tx
        .insert(pastureCells)
        .values(rows.cells)
        .onConflictDoUpdate({
          target: pastureCells.id,
          set: {
            grassBiomassKgHa:  pastureCells.grassBiomassKgHa,
            rootHealth:        pastureCells.rootHealth,
            soilHealth:        pastureCells.soilHealth,
            soilMoisture:      pastureCells.soilMoisture,
            nutrients:         pastureCells.nutrients,
            biodiversity:      pastureCells.biodiversity,
            lastGrazedAt:      pastureCells.lastGrazedAt,
            lastManuredAt:     pastureCells.lastManuredAt,
          },
        });
    }

    // Upsert paddocks — cell membership can change (Milestone 4 fencing).
    if (rows.paddocks.length > 0) {
      await tx
        .insert(paddocks)
        .values(rows.paddocks)
        .onConflictDoUpdate({
          target: paddocks.id,
          set: {
            name:    paddocks.name,
            cellIds: paddocks.cellIds,
          },
        });
    }

    // Upsert cows — new calves come in, existing cows update weight/status.
    if (rows.cows.length > 0) {
      await tx
        .insert(cows)
        .values(rows.cows)
        .onConflictDoUpdate({
          target: cows.id,
          set: {
            ageDays:            cows.ageDays,
            weightKg:           cows.weightKg,
            bodyConditionScore: cows.bodyConditionScore,
            health:             cows.health,
            fertility:          cows.fertility,
            pregnant:           cows.pregnant,
            pregnancyDays:      cows.pregnancyDays,
            status:             cows.status,
            currentPaddockId:   cows.currentPaddockId,
            exitSimHour:        cows.exitSimHour,
          },
        });
    }

    // Events are append-only — insert new ones, ignore duplicates.
    if (rows.events.length > 0) {
      await tx
        .insert(farmEvents)
        .values(rows.events)
        .onConflictDoNothing();
    }
  });
};

export const createFarm = async (db: Db, state: FarmState, userId?: string): Promise<void> => {
  const rows = stateToFarmRows(state, []);

  await db.transaction(async (tx) => {
    await tx.insert(farms).values({
      ...rows.farm,
      userId: userId ?? null,
      lastSimulatedAt: new Date(),
    });
    if (rows.cells.length > 0)    await tx.insert(pastureCells).values(rows.cells);
    if (rows.paddocks.length > 0) await tx.insert(paddocks).values(rows.paddocks);
    if (rows.cows.length > 0)     await tx.insert(cows).values(rows.cows);
  });
};

export const listFarmsForUser = async (db: Db, userId: string) => {
  return db
    .select({
      id:              farms.id,
      name:            farms.name,
      simHour:         farms.simHour,
      season:          farms.season,
      lastSimulatedAt: farms.lastSimulatedAt,
    })
    .from(farms)
    .where(eq(farms.userId, userId));
};

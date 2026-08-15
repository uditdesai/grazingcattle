/**
 * Drizzle schema — the single source of truth for what tables exist in
 * Postgres and what columns they have.
 *
 * HOW THIS WORKS (for frontend engineers):
 * Think of each `pgTable(...)` call like writing a TypeScript interface,
 * except Drizzle reads it to:
 *   1. Generate the SQL migration that creates the table ("db:generate").
 *   2. Give you fully typed query results — selecting a row from `cows`
 *      returns an object typed to match the columns you defined here,
 *      no manual casting required.
 *
 * Each table maps 1:1 to a TypeScript type in packages/game-types.
 * The mapping layer (mapper.ts) converts between the two directions:
 *   DB rows  →  FarmState  (when loading)
 *   FarmState  →  DB rows  (when saving)
 */

import { boolean, integer, jsonb, pgTable, real, text, timestamp } from "drizzle-orm/pg-core";

// ─── FARMS ────────────────────────────────────────────────────────────────────
// One row per player's farm. Stores the farm-level fields from FarmState:
// which simulation hour we're at, what time (wall-clock) we last simulated
// (so we can compute how many hours to catch up on login), and the RNG seed.
//
// user_id is nullable now — we'll make it non-null in Milestone 3 once auth
// is wired up and row-level security is in place.

export const farms = pgTable("farms", {
  id:               text("id").primaryKey(),
  userId:           text("user_id"),
  name:             text("name").notNull(),

  // The simulation clock. Every hour of game time increments this by 1.
  simHour:          integer("sim_hour").notNull().default(0),

  // The real wall-clock moment when we last ran the simulation forward.
  // On login we compute: floor((now - lastSimulatedAt) / 3_600_000 * 5)
  // to know how many farm-hours to catch up. See FARM_HOURS_PER_REAL_HOUR.
  lastSimulatedAt:  timestamp("last_simulated_at", { withTimezone: true }).notNull()
                      .defaultNow(),

  season:           text("season").notNull().default("spring"),

  // weatherToday is a small value object ({ season, temperatureC, rainfallMm,
  // sunlightHours }). Not worth a separate table — store as JSON.
  weatherToday:     jsonb("weather_today").notNull().default({}),

  moneyUsd:         real("money_usd").notNull().default(10000),

  // Deterministic RNG seed. Same seed + same simHour always produces the
  // same weather/events, which is what makes catch-up simulation reliable.
  seed:             text("seed").notNull(),
});

// ─── PASTURE CELLS ───────────────────────────────────────────────────────────
// One row per grid cell. Your current sim uses an 8×8 = 64-cell grid, so
// each farm has 64 rows in this table. All the ecological stats live here:
// grass biomass, soil health, root health, moisture, nutrients, biodiversity.

export const pastureCells = pgTable("pasture_cells", {
  id:                  text("id").primaryKey(),
  farmId:              text("farm_id").notNull().references(() => farms.id, { onDelete: "cascade" }),

  // Grid position. Used by the Milestone 3 map to know where to draw each cell.
  x:                   integer("x").notNull(),
  y:                   integer("y").notNull(),

  grassBiomassKgHa:    real("grass_biomass_kg_ha").notNull(),
  maxBiomassKgHa:      real("max_biomass_kg_ha").notNull(),
  rootHealth:          real("root_health").notNull(),
  soilHealth:          real("soil_health").notNull(),
  soilMoisture:        real("soil_moisture").notNull(),
  nutrients:           real("nutrients").notNull(),
  biodiversity:        real("biodiversity").notNull(),

  // Sim-hour of last grazing/manure events, or null if never occurred.
  lastGrazedAt:        integer("last_grazed_at"),
  lastManuredAt:       integer("last_manured_at"),
});

// ─── PADDOCKS ─────────────────────────────────────────────────────────────────
// One row per fenced paddock. Stores which cell IDs are inside it.
// In Milestone 4, fence geometry will compute cellIds from drawn fence lines —
// this table shape doesn't need to change when that happens.

export const paddocks = pgTable("paddocks", {
  id:      text("id").primaryKey(),
  farmId:  text("farm_id").notNull().references(() => farms.id, { onDelete: "cascade" }),
  name:    text("name").notNull(),

  // Array of pasture_cells.id values inside this paddock.
  // text[] is a native Postgres type — no need for a join table at this scale.
  cellIds: text("cell_ids").array().notNull().default([]),
});

// ─── COWS ────────────────────────────────────────────────────────────────────
// One row per cow, including dead/sold/slaughtered ones. We keep exited cows
// so the farm history ("Bessie lived 4 years, died of old age on day 1423")
// is queryable. Status filters them out for gameplay purposes.

export const cows = pgTable("cows", {
  id:                 text("id").primaryKey(),
  farmId:             text("farm_id").notNull().references(() => farms.id, { onDelete: "cascade" }),

  name:               text("name"),
  sex:                text("sex").notNull(),
  breed:              text("breed").notNull(),

  // ageDays and pregnancyDays are stored as real (float) because the sim
  // accumulates them in 1/24-day increments per hour.
  ageDays:            real("age_days").notNull(),
  weightKg:           real("weight_kg").notNull(),
  matureWeightKg:     real("mature_weight_kg").notNull(),
  bodyConditionScore: real("body_condition_score").notNull(),
  health:             real("health").notNull(),
  fertility:          real("fertility").notNull(),
  pregnant:           boolean("pregnant").notNull().default(false),
  pregnancyDays:      real("pregnancy_days"),

  status:             text("status").notNull(),
  currentPaddockId:   text("current_paddock_id"),
  birthSimHour:       integer("birth_sim_hour").notNull(),
  exitSimHour:        integer("exit_sim_hour"),
});

// ─── FARM EVENTS ─────────────────────────────────────────────────────────────
// Append-only log. Every significant thing that happens during simulation
// (calf born, cow died, season changed, pasture degraded) goes here.
// These populate the "while you were away" report on login.
// We never update rows in this table — only insert.

export const farmEvents = pgTable("farm_events", {
  id:      text("id").primaryKey(),
  farmId:  text("farm_id").notNull().references(() => farms.id, { onDelete: "cascade" }),
  simHour: integer("sim_hour").notNull(),

  // The event type string: "CALF_BORN", "COW_DIED", "SEASON_CHANGED", etc.
  type:    text("type").notNull(),

  // Event-specific payload. CALF_BORN gets { calfId, motherId };
  // COW_DIED gets { cowId, cause }; etc. Typed in game-types/FarmEvent.ts.
  data:    jsonb("data").notNull().default({}),
});

// ─── TYPE HELPERS ─────────────────────────────────────────────────────────────
// Drizzle can infer the TypeScript type of a selected row automatically.
// These are the "what you get back from a SELECT" types for each table.
// The mapper (mapper.ts) uses these as its input types.

export type FarmRow         = typeof farms.$inferSelect;
export type PastureCellRow  = typeof pastureCells.$inferSelect;
export type PaddockRow      = typeof paddocks.$inferSelect;
export type CowRow          = typeof cows.$inferSelect;
export type FarmEventRow    = typeof farmEvents.$inferSelect;

/**
 * Database client — the live connection to Postgres.
 *
 * HOW THIS WORKS:
 * `postgres` (the npm package) opens a connection pool to the DB.
 * `drizzle(sql, { schema })` wraps that connection with Drizzle's query
 * builder, which is what gives you the type-safe `.select()`, `.insert()`,
 * `.update()` calls you'll use in the route handlers.
 *
 * Why two separate functions?
 *   createDb()       — uses SUPABASE_DB_POOLER_URL (port 6543, transaction
 *                      pooler). This is what the app uses at runtime. On
 *                      Vercel, each serverless function invocation may be
 *                      a fresh process, so the pooler handles connection
 *                      reuse for us rather than us managing a persistent pool.
 *
 *   createMigrationDb() — uses SUPABASE_DB_URL (port 5432, direct). Migration
 *                      commands need a persistent session (they use advisory
 *                      locks to prevent two migration runs at once), which the
 *                      transaction pooler doesn't support. Direct connection
 *                      only used from drizzle-kit CLI, not from app code.
 */

import { drizzle } from "drizzle-orm/postgres-js";
import postgres from "postgres";
import * as schema from "./schema";

export const createDb = () => {
  const connectionString = process.env.SUPABASE_DB_POOLER_URL;
  if (!connectionString) {
    throw new Error("SUPABASE_DB_POOLER_URL is not set. Check apps/web/.env.local");
  }
  // max: 1 on serverless — each Vercel function invocation should not try
  // to hold more than one connection (the pooler multiplexes for us).
  const sql = postgres(connectionString, { max: 1 });
  return drizzle(sql, { schema });
};

export const createMigrationDb = () => {
  const connectionString = process.env.SUPABASE_DB_URL;
  if (!connectionString) {
    throw new Error("SUPABASE_DB_URL is not set. Check apps/web/.env.local");
  }
  const sql = postgres(connectionString, { max: 1 });
  return drizzle(sql, { schema });
};

// Convenience type — the return type of createDb(), used as a parameter
// type in query functions so they don't need to import createDb directly.
export type Db = ReturnType<typeof createDb>;

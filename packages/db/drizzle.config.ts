/**
 * Drizzle Kit config — only used by the CLI commands (db:generate, db:migrate,
 * db:studio). Not imported by the app at runtime.
 *
 * HOW THIS WORKS:
 * `drizzle-kit generate` reads the schema file and compares it to the last
 * generated migration to figure out what SQL is needed to bring the DB in
 * line with the TypeScript definition. It writes that SQL into src/migrations/.
 *
 * `drizzle-kit migrate` runs those SQL files against the database in order,
 * recording which ones it's already applied so it never runs the same one twice.
 *
 * Uses the DIRECT connection (SUPABASE_DB_URL, port 5432) because the
 * transaction pooler (6543) doesn't support the session-level advisory locks
 * that migration runs use to prevent two concurrent migration jobs.
 */

import { defineConfig } from "drizzle-kit";

export default defineConfig({
  dialect:     "postgresql",
  schema:      "./src/schema.ts",
  out:         "./src/migrations",
  dbCredentials: {
    url: process.env.SUPABASE_DB_URL!,
  },
  verbose: true,
  strict:  true,
});

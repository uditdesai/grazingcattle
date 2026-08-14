import { NextResponse } from "next/server";
import { z } from "zod";
import { simulateFarm } from "@grazingcattle/simulation";
import type { FarmState } from "@grazingcattle/game-types";

// Drizzle's Postgres driver (Milestone 2) needs Node APIs the Edge runtime
// doesn't provide, so every route handler that touches farm state runs on
// Node from the start — keeps this route's runtime unchanged when it
// starts talking to the database.
export const runtime = "nodejs";

/**
 * A full field-by-field schema for FarmState would duplicate every type in
 * game-types/src/Farm.ts. For this dev-only endpoint we validate just
 * enough to catch a malformed request — wrong shape entirely, missing
 * top-level fields — and trust the rest. The dev page is the only caller,
 * and it always sends back exactly what this endpoint most recently gave
 * it. Milestone 2 replaces "trust the posted state" with loading FarmState
 * from Postgres, so a deep request schema here would be thrown away then
 * anyway.
 */
const stepRequestSchema = z.object({
  farm: z.object({
    id: z.string(),
    name: z.string(),
    simHour: z.number(),
    season: z.enum(["spring", "summer", "fall", "winter"]),
    weatherToday: z.object({
      season: z.enum(["spring", "summer", "fall", "winter"]),
      temperatureC: z.number(),
      rainfallMm: z.number(),
      sunlightHours: z.number(),
    }),
    cells: z.array(z.record(z.string(), z.unknown())),
    paddocks: z.array(z.record(z.string(), z.unknown())),
    cows: z.array(z.record(z.string(), z.unknown())),
    moneyUsd: z.number(),
    seed: z.string(),
  }),
  hours: z.number().int().positive().max(24 * 366),
});

/** POST /api/dev/step — { farm, hours } -> { farm, events }. */
export async function POST(request: Request) {
  const body = await request.json();
  const parsed = stepRequestSchema.safeParse(body);

  if (!parsed.success) {
    return NextResponse.json({ error: parsed.error.flatten() }, { status: 400 });
  }

  const farm = parsed.data.farm as unknown as FarmState;
  const result = simulateFarm(farm, parsed.data.hours);

  return NextResponse.json(result);
}

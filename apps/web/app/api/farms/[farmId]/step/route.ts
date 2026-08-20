/**
 * POST /api/farms/[farmId]/step — advance the simulation by N hours.
 *
 * HOW THIS WORKS:
 * The browser sends { hours: 24 } (or 168 for a week, 720 for a month).
 * This handler:
 *   1. Loads the authoritative farm state from the DB (ignores any state
 *      the client might try to sneak in — the client only sends hours).
 *   2. Runs simulateFarm(state, hours) to advance the sim.
 *   3. Saves the result back to the DB.
 *   4. Returns the new state + events to the browser.
 *
 * The browser updates its local display from the response — it never stores
 * authoritative game state, it just shows what the server last returned.
 */

import { createClient } from "@/lib/supabase/server";
import { createDb, listRecentFarmEvents, loadFarm, saveFarm } from "@grazingcattle/db";
import { simulateFarm } from "@grazingcattle/simulation";
import { NextResponse } from "next/server";
import { z } from "zod";

export const runtime = "nodejs";

const bodySchema = z.object({
  hours: z.number().int().positive().max(24 * 366),
});

export const POST = async (
  request: Request,
  { params }: { params: Promise<{ farmId: string }> },
) => {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { farmId } = await params;

  const parsed = bodySchema.safeParse(await request.json());
  if (!parsed.success) {
    return NextResponse.json({ error: parsed.error.flatten() }, { status: 400 });
  }

  const db = createDb();
  const state = await loadFarm(db, farmId);
  if (!state) return NextResponse.json({ error: "Farm not found" }, { status: 404 });

  const result = simulateFarm(state, parsed.data.hours);
  await saveFarm(db, result.farm, result.events, new Date());
  const recentEvents = await listRecentFarmEvents(db, farmId, 50);

  return NextResponse.json({ farm: result.farm, events: recentEvents });
};

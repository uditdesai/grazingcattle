/**
 * GET /api/farms — load the user's farm, running catch-up simulation if needed.
 *
 * HOW THIS WORKS:
 * This is the first thing the /dev page calls on load. Three cases:
 *
 * 1. New user (no farm yet) — build a starting farm from the "sustainable"
 *    scenario, save it to the DB, and return it fresh.
 *
 * 2. Returning user, last visit recent — load from DB, no simulation needed.
 *
 * 3. Returning user, was away — compute how many farm-hours passed since the
 *    last simulated moment, run the simulation forward that many hours (the
 *    "catch-up"), save the result, return it with the events that happened
 *    while the user was gone.
 *
 * The catch-up uses FARM_HOURS_PER_REAL_HOUR = 5, meaning 1 real-world hour
 * = 5 farm hours. So if you were away for 10 real hours, your farm advanced
 * 50 farm hours (a little over 2 farm days).
 *
 * WHY THIS ROUTE EXISTS (vs. the client just sending state):
 * The old /api/dev/step route let the browser POST the farm state and trusted
 * it. That's fine for local dev but breaks for a real game — a player could
 * POST whatever state they wanted and cheat. This route loads from the DB
 * (the server's source of truth) so the client never controls the state.
 */

import { createClient } from "@/lib/supabase/server";
import { createDb, createFarm, listFarmsForUser, loadFarm, saveFarm } from "@grazingcattle/db";
import { buildScenario, simulateFarm } from "@grazingcattle/simulation";
import { NextResponse } from "next/server";

export const runtime = "nodejs";

// 1 real hour = 5 farm hours. See memory: project_time_ratio.md
const FARM_HOURS_PER_REAL_HOUR = 5;

export const GET = async () => {
  // 1. Verify the session. getUser() talks to Supabase's server to confirm the
  //    token is real — unlike getSession() which just reads the cookie blindly.
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const db = createDb();

  // 2. Check if this user already has a farm.
  const existingFarms = await listFarmsForUser(db, user.id);

  if (existingFarms.length === 0) {
    // 3a. First visit — create a starting farm and save it.
    const farmId = crypto.randomUUID();
    const scenario = buildScenario("sustainable");
    const state = {
      ...scenario.farm,
      id:   farmId,
      name: "My Farm",
      seed: farmId,
    };
    await createFarm(db, state, user.id);
    return NextResponse.json({ farm: state, events: [], catchUpHours: 0 });
  }

  // 3b. Returning user — load the full farm state.
  const farmMeta = existingFarms[0]!;
  const state = await loadFarm(db, farmMeta.id);
  if (!state) {
    return NextResponse.json({ error: "Farm not found" }, { status: 404 });
  }

  // 4. Catch-up: compute farm-hours elapsed since last simulation.
  const now = new Date();
  const realMsElapsed = now.getTime() - farmMeta.lastSimulatedAt.getTime();
  const realHoursElapsed = realMsElapsed / (1000 * 60 * 60);
  const catchUpHours = Math.max(0, Math.floor(realHoursElapsed * FARM_HOURS_PER_REAL_HOUR));

  if (catchUpHours > 0) {
    const result = simulateFarm(state, catchUpHours);
    await saveFarm(db, result.farm, result.events, now);
    return NextResponse.json({ farm: result.farm, events: result.events, catchUpHours });
  }

  return NextResponse.json({ farm: state, events: [], catchUpHours: 0 });
};

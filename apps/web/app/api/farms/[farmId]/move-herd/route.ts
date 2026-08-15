/**
 * POST /api/farms/[farmId]/move-herd — move all live cows to a different paddock.
 *
 * HOW THIS WORKS:
 * The browser sends { targetPaddockId: "paddock-2" }.
 * This handler loads the farm, updates every live cow's currentPaddockId,
 * saves back to the DB, and returns the updated farm.
 *
 * This is a player action, not a simulation step — the sim clock doesn't
 * advance here. We're just changing which paddock each cow is assigned to,
 * which the next simulateFarm call will pick up.
 */

import { createClient } from "@/lib/supabase/server";
import { createDb, loadFarm, saveFarm } from "@grazingcattle/db";
import { NextResponse } from "next/server";
import { z } from "zod";

export const runtime = "nodejs";

const bodySchema = z.object({
  targetPaddockId: z.string().min(1),
});

const isLive = (status: string) =>
  status !== "dead" && status !== "sold" && status !== "slaughtered";

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

  const { targetPaddockId } = parsed.data;
  const paddockExists = state.paddocks.some((p) => p.id === targetPaddockId);
  if (!paddockExists) {
    return NextResponse.json({ error: "Paddock not found" }, { status: 400 });
  }

  const updated = {
    ...state,
    cows: state.cows.map((cow) =>
      isLive(cow.status) ? { ...cow, currentPaddockId: targetPaddockId } : cow,
    ),
  };

  await saveFarm(db, updated, [], new Date());
  return NextResponse.json({ farm: updated });
};

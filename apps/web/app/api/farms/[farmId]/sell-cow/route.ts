/**
 * POST /api/farms/[farmId]/sell-cow — mark a cow as sold and credit the farm.
 *
 * HOW THIS WORKS:
 * The browser sends { cowId: "cow_3" }.
 * This handler:
 *   1. Loads the farm from DB.
 *   2. Computes a sale price (roughly $2.50/kg live weight — placeholder).
 *   3. Marks the cow's status as "sold" and removes it from its paddock.
 *   4. Adds the sale price to farm.moneyUsd.
 *   5. Records a COW_SOLD event (so the events log shows the transaction).
 *   6. Saves and returns the updated farm.
 */

import { createClient } from "@/lib/supabase/server";
import { createDb, loadFarm, saveFarm } from "@grazingcattle/db";
import type { FarmEvent } from "@grazingcattle/game-types";
import { NextResponse } from "next/server";
import { z } from "zod";

export const runtime = "nodejs";

const bodySchema = z.object({
  cowId: z.string().min(1),
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

  const { cowId } = parsed.data;
  const cow = state.cows.find((c) => c.id === cowId);
  if (!cow || cow.status === "dead" || cow.status === "sold" || cow.status === "slaughtered") {
    return NextResponse.json({ error: "Cow not available for sale" }, { status: 400 });
  }

  // Placeholder price: $2.50 per kg live weight.
  const priceUsd = Math.round(cow.weightKg * 2.5);

  const sellEvent: FarmEvent = {
    id:      crypto.randomUUID(),
    farmId:  state.id,
    simHour: state.simHour,
    type:    "COW_SOLD",
    data:    { cowId, priceUsd },
  };

  const updated = {
    ...state,
    moneyUsd: state.moneyUsd + priceUsd,
    cows: state.cows.map((c) =>
      c.id === cowId
        ? { ...c, status: "sold" as const, currentPaddockId: null, exitSimHour: state.simHour }
        : c,
    ),
  };

  await saveFarm(db, updated, [sellEvent], new Date());
  return NextResponse.json({ farm: updated, event: sellEvent });
};

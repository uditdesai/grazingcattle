import { NextResponse } from "next/server";
import { buildScenario } from "@grazingcattle/simulation";

export const runtime = "nodejs";

/**
 * GET /api/dev/scenario — returns a fresh starting farm: 8 cows, 4 empty
 * paddocks, land at a moderate starting condition.
 *
 * The CLI (`pnpm sim --scenario ...`) has three named scenarios —
 * sustainable/overstocked/rotational — because it runs them hands-off as
 * automated policy comparisons. This dev page is the opposite: a human
 * moves the herd and sells cows themselves, so there's nothing for a named
 * "policy" to mean here. One consistent starting farm is enough — what
 * happens to it is entirely up to whoever is clicking the buttons.
 */
export async function GET() {
  const scenario = buildScenario("sustainable");
  return NextResponse.json(scenario);
}

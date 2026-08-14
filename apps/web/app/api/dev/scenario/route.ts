import { NextResponse } from "next/server";
import { buildScenario, type ScenarioName } from "@grazingcattle/simulation";

export const runtime = "nodejs";

const VALID_SCENARIOS: ScenarioName[] = ["sustainable", "overstocked", "rotational"];

function isScenarioName(value: string): value is ScenarioName {
  return (VALID_SCENARIOS as string[]).includes(value);
}

/** GET /api/dev/scenario?name=sustainable — returns a fresh starting farm. */
export async function GET(request: Request) {
  const { searchParams } = new URL(request.url);
  const nameParam = searchParams.get("name") ?? "sustainable";

  if (!isScenarioName(nameParam)) {
    return NextResponse.json(
      { error: `Unknown scenario "${nameParam}". Valid: ${VALID_SCENARIOS.join(", ")}` },
      { status: 400 },
    );
  }

  const scenario = buildScenario(nameParam);
  return NextResponse.json(scenario);
}

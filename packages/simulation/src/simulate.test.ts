import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { buildScenario, type ScenarioName } from "./scenarios";
import { simulateFarm } from "./simulate";

/**
 * Determinism check: running simulateFarm twice with identical inputs must
 * produce byte-identical outputs.
 *
 * Why this matters: in Milestone 2, a "catch-up simulation" re-runs the farm
 * forward from the last saved state whenever a player logs in. If the sim is
 * not deterministic, the catch-up result diverges from what actually happened
 * in the player's session — farm state silently drifts. The seeded RNG and
 * pure-function design exist specifically to prevent this; this test verifies
 * that guarantee holds end-to-end.
 *
 * What "deterministic" means here: same farmSeed + same simHour + same inputs
 * = same outputs, regardless of how many times you call it or in what order.
 * It does NOT mean two different farms produce the same result (they won't —
 * they have different seeds). It also doesn't mean two different scenarios
 * produce the same result.
 */

const SCENARIOS: ScenarioName[] = ["sustainable", "overstocked", "rotational"];

// 10 days covers: weather variation, grazing, root health updates, soil
// health drift, breeding probability rolls, potential death checks. Short
// enough to run in milliseconds; long enough to exercise all the RNG channels.
const TEST_HOURS = 24 * 10;

describe("simulateFarm determinism", () => {
  for (const scenarioName of SCENARIOS) {
    it(`produces identical output on two runs — ${scenarioName}`, () => {
      const { farm } = buildScenario(scenarioName);

      const resultA = simulateFarm(farm, TEST_HOURS);
      const resultB = simulateFarm(farm, TEST_HOURS);

      // JSON.stringify is a deep equality check that works on the plain-object
      // FarmState shape. If any field anywhere diverges (including nested
      // cells, cows, or events), the strings won't match.
      assert.strictEqual(
        JSON.stringify(resultA),
        JSON.stringify(resultB),
        `Two runs of "${scenarioName}" produced different output — a non-deterministic RNG call or mutable shared state is likely the cause`,
      );
    });
  }

  it("different seeds produce different weather", () => {
    // Sanity-check that the seeding actually matters — two farms with
    // different seeds should diverge. If they didn't, seeding would be broken
    // and the determinism tests above would pass vacuously.
    const { farm: farmA } = buildScenario("sustainable");
    const { farm: farmB } = buildScenario("sustainable");
    // Give them different seeds
    const seededA = { ...farmA, seed: "seed-alpha", id: "seed-alpha" };
    const seededB = { ...farmB, seed: "seed-beta", id: "seed-beta" };

    const resultA = simulateFarm(seededA, TEST_HOURS);
    const resultB = simulateFarm(seededB, TEST_HOURS);

    assert.notStrictEqual(
      JSON.stringify(resultA.farm.weatherToday),
      JSON.stringify(resultB.farm.weatherToday),
      "Two different seeds produced identical weather — seeding may be broken",
    );
  });
});

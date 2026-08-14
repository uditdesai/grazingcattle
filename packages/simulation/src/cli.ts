import type { FarmEvent } from "@grazingcattle/game-types";
import { buildScenario, type ScenarioName } from "./scenarios";
import { simulateFarm } from "./simulate";

const PADDOCK_SEQUENCE = ["paddock-1", "paddock-2", "paddock-3", "paddock-4"];

const parseArgs = (argv: string[]): { scenario: ScenarioName; days: number } => {
  let scenario: ScenarioName = "sustainable";
  let days = 180;

  for (let i = 0; i < argv.length; i++) {
    const arg = argv[i];
    if (arg === "--scenario") scenario = argv[++i] as ScenarioName;
    else if (arg === "--overstocked") scenario = "overstocked";
    else if (arg === "--rotational") scenario = "rotational";
    else if (arg === "--sustainable") scenario = "sustainable";
    else if (arg === "--days") days = Number(argv[++i]);
  }

  return { scenario, days };
};

const mean = (values: number[]): number => {
  if (values.length === 0) return 0;
  return values.reduce((a, b) => a + b, 0) / values.length;
};

const summarizeEvents = (events: FarmEvent[]): string => {
  if (events.length === 0) return "";
  const counts = new Map<string, number>();
  for (const event of events) counts.set(event.type, (counts.get(event.type) ?? 0) + 1);
  return [...counts.entries()].map(([type, count]) => `${type}x${count}`).join(", ");
};

const main = (): void => {
  const { scenario: scenarioName, days } = parseArgs(process.argv.slice(2));
  const scenario = buildScenario(scenarioName);
  let farm = scenario.farm;

  console.log(`Scenario: ${farm.name}\n`);
  console.log(
    ["day", "season", "rain", "grass", "soil", "roots", "herd", "wt(kg)", "bcs", "events"]
      .map((h, i) => (i === 0 ? h.padStart(4) : i < 9 ? h.padStart(7) : h))
      .join(" "),
  );

  for (let day = 0; day < days; day++) {
    if (scenario.rotationIntervalDays && day > 0 && day % scenario.rotationIntervalDays === 0) {
      const firstCowPaddock = farm.cows[0]?.currentPaddockId ?? PADDOCK_SEQUENCE[0]!;
      const currentIndex = PADDOCK_SEQUENCE.indexOf(firstCowPaddock);
      const nextPaddockId = PADDOCK_SEQUENCE[(currentIndex + 1) % PADDOCK_SEQUENCE.length]!;
      farm = {
        ...farm,
        cows: farm.cows.map((cow) =>
          cow.currentPaddockId ? { ...cow, currentPaddockId: nextPaddockId } : cow,
        ),
      };
    }

    const result = simulateFarm(farm, 24);
    farm = result.farm;

    const liveCows = farm.cows.filter(
      (c) => c.status !== "dead" && c.status !== "sold" && c.status !== "slaughtered",
    );

    // Report the paddock the herd is actually in. Farm-wide means average a
    // destroyed paddock together with untouched ones and hide the damage.
    const herdPaddockId = liveCows[0]?.currentPaddockId;
    const herdPaddock = farm.paddocks.find((p) => p.id === herdPaddockId);
    const reportedCellIds = new Set(herdPaddock?.cellIds ?? farm.cells.map((c) => c.id));
    const reportedCells = farm.cells.filter((c) => reportedCellIds.has(c.id));

    const meanGrass = mean(reportedCells.map((c) => c.grassBiomassKgHa));
    const meanSoil = mean(reportedCells.map((c) => c.soilHealth));
    const meanRoots = mean(reportedCells.map((c) => c.rootHealth));
    const meanWeight = mean(liveCows.map((c) => c.weightKg));
    const meanBcs = mean(liveCows.map((c) => c.bodyConditionScore));

    console.log(
      [
        String(day).padStart(4),
        farm.season.padStart(7),
        farm.weatherToday.rainfallMm.toFixed(1).padStart(7),
        meanGrass.toFixed(0).padStart(7),
        meanSoil.toFixed(2).padStart(7),
        meanRoots.toFixed(2).padStart(7),
        String(liveCows.length).padStart(7),
        meanWeight.toFixed(0).padStart(7),
        meanBcs.toFixed(1).padStart(7),
        summarizeEvents(result.events),
      ].join(" "),
    );
  }
};

main();

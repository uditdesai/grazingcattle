import type { Cow } from "./Cow";
import type { Paddock, PastureCell } from "./Pasture";
import type { Season, Weather } from "./Weather";

export type FarmState = {
  id: string;
  name: string;

  /** The simulation clock: total farm-hours elapsed since farm creation. */
  simHour: number;
  season: Season;
  weatherToday: Weather;

  cells: PastureCell[];
  paddocks: Paddock[];
  cows: Cow[];

  moneyUsd: number;

  /** Base seed for this farm's deterministic RNG (see rng.ts, Step 3). */
  seed: string;
};

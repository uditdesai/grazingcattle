import type { Season, Weather } from "@grazingcattle/game-types";
import { MAX_SUNLIGHT_HOURS, SEASONAL_BASELINES } from "./constants";
import { rngFor } from "./rng";

/**
 * Farm-year length in days. A clean 360 (4×90) rather than a real 365 —
 * this is a game calendar, not a real one, and even season lengths keep
 * tuning simple.
 */
export const YEAR_LENGTH_DAYS = 360;
export const SEASON_LENGTH_DAYS = YEAR_LENGTH_DAYS / 4;

const SEASON_ORDER: Season[] = ["spring", "summer", "fall", "winter"];

export const seasonForDay = (dayIndex: number): Season => {
  const dayOfYear = ((dayIndex % YEAR_LENGTH_DAYS) + YEAR_LENGTH_DAYS) % YEAR_LENGTH_DAYS;
  const seasonIndex = Math.floor(dayOfYear / SEASON_LENGTH_DAYS);
  return SEASON_ORDER[seasonIndex]!;
};

/**
 * Deterministically generates one day's weather. `simHour` should be the
 * start-of-day hour (a multiple of 24) — the whole day shares one weather
 * reading, resolved once per day per the tick-frequency plan.
 */
export const generateWeather = (farmSeed: string, simHour: number): Weather => {
  const dayIndex = Math.floor(simHour / 24);
  const season = seasonForDay(dayIndex);
  const baseline = SEASONAL_BASELINES[season];
  const rng = rngFor(farmSeed, simHour, "weather");

  const temperatureC = rng.gaussian(baseline.temperatureC.mean, baseline.temperatureC.stdDev);
  const rainfallMm = Math.max(
    0,
    rng.gaussian(baseline.rainfallMm.mean, baseline.rainfallMm.stdDev),
  );
  const sunlightHours = Math.min(
    MAX_SUNLIGHT_HOURS,
    Math.max(0, rng.gaussian(baseline.sunlightHours.mean, baseline.sunlightHours.stdDev)),
  );

  return { season, temperatureC, rainfallMm, sunlightHours };
};

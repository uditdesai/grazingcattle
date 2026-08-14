export type Season = "spring" | "summer" | "fall" | "winter";

/** A single farm-day's weather snapshot. */
export type Weather = {
  season: Season;
  /** Mean daily air temperature, °C. */
  temperatureC: number;
  /** Total rainfall for the day, mm. */
  rainfallMm: number;
  /** Hours of usable sunlight that day. */
  sunlightHours: number;
};

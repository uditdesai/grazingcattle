import type { PastureCell, Weather } from "@grazingcattle/game-types";

/**
 * Growth-rate reference constants. Tunable; revisited in Step 6.
 * Reference: Cacho (1993) sigmoid pasture growth — logistic curve driven by
 * temperature, moisture and sunlight, the standard building block in
 * research-grade grazing models (GrassGro, APSIM-AgPasture, SPUR).
 */
const GROWTH = {
  /** Base fractional growth rate per hour at ideal conditions, rootHealth = 1. */
  baseRatePerHour: 0.0035,
  /** Temperature (°C) at which growth is fastest. */
  optimalTempC: 20,
  /**
   * Falloff away from optimalTempC. Calibrated so a C3 temperate grass at
   * 4 °C grows at ~8% of peak (near-dormant) and at 24 °C at ~85% — the
   * previous 0.0035 left winter growing at 40% of peak, which is why the
   * measured seasonal curve had no real dormancy.
   */
  tempSensitivity: 0.01,
  /** Below this temperature, growth stops entirely (winter dormancy). */
  minGrowthTempC: 2,
};

/**
 * Plant-available water held in the root zone, mm. Converts real rainfall
 * and evapotranspiration (both in mm) into the cell's 0–1 moisture bucket
 * instead of the arbitrary scaling factors used previously.
 */
const ROOT_ZONE_CAPACITY_MM = 120;

/** Bell-curve-ish response to temperature, 0–1. */
function computeTemperatureFactor(temperatureC: number): number {
  if (temperatureC < GROWTH.minGrowthTempC) return 0;
  const delta = temperatureC - GROWTH.optimalTempC;
  return Math.exp(-GROWTH.tempSensitivity * delta * delta);
}

/** Soil moisture (0–1 bucket) limits growth below a comfortable threshold. */
function computeMoistureFactor(soilMoisture: number): number {
  return Math.max(0, Math.min(1, soilMoisture / 0.6));
}

/**
 * Advances one cell's grass biomass by one simulated hour of growth.
 * Does NOT apply grazing removal — that's grazing.ts's job, called
 * separately so the two effects stay independently testable.
 */
export function growGrassOneHour(cell: PastureCell, weather: Weather): PastureCell {
  const temperatureFactor = computeTemperatureFactor(weather.temperatureC);
  const moistureFactor = computeMoistureFactor(cell.soilMoisture);

  // rootHealth directly throttles growth rate — this is the mechanical
  // consequence of overgrazing forcing the plant to draw down root reserves.
  const growthRate =
    GROWTH.baseRatePerHour * temperatureFactor * moistureFactor * cell.rootHealth;

  const logisticTerm = cell.grassBiomassKgHa * (1 - cell.grassBiomassKgHa / cell.maxBiomassKgHa);
  const deltaBiomass = growthRate * logisticTerm;

  const grassBiomassKgHa = Math.max(
    0,
    Math.min(cell.maxBiomassKgHa, cell.grassBiomassKgHa + deltaBiomass),
  );

  return { ...cell, grassBiomassKgHa };
}

/**
 * Soil moisture bucket update: rain adds, a fixed evapotranspiration rate
 * drains it (higher in heat/sunlight). Simple, not a real water-balance model.
 */
export function updateSoilMoistureOneHour(cell: PastureCell, weather: Weather): PastureCell {
  const rainMmPerHour = weather.rainfallMm / 24;

  // Reference evapotranspiration, mm/day: a baseline plus sunlight and
  // heat terms. Lands around 2.5 mm/day in spring and 3.9 in summer,
  // matching typical temperate-grassland ET.
  const evapotranspirationMmPerDay =
    1.5 + (weather.sunlightHours / 12) * 2 + Math.max(0, weather.temperatureC - 15) / 10;
  const evapotranspirationMmPerHour = evapotranspirationMmPerDay / 24;

  const netMmPerHour = rainMmPerHour - evapotranspirationMmPerHour;
  const soilMoisture = Math.max(
    0,
    Math.min(1, cell.soilMoisture + netMmPerHour / ROOT_ZONE_CAPACITY_MM),
  );

  return { ...cell, soilMoisture };
}

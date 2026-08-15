import type { PastureCell, Weather } from "@grazingcattle/game-types";

// ---------------------------------------------------------------------------
// PLAIN-ENGLISH OVERVIEW
//
// Every grid cell has a grassBiomassKgHa (how much grass is standing there
// right now, in kg per hectare) and a maxBiomassKgHa (the ceiling that spot
// of land can support). Each simulated hour, grass grows a bit toward that
// ceiling. How fast depends on three multipliers, each 0-1, that all have to
// be reasonably good at once for grass to grow well:
//   - temperature (grass barely grows when it's freezing or scorching)
//   - soil moisture (dry ground can't support fast growth)
//   - rootHealth (roots damaged by overgrazing can't fuel fast regrowth)
// This file does NOT remove grass for grazing — that's grazing.ts. This file
// only ever adds grass back.
// ---------------------------------------------------------------------------

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

/**
 * Bell-curve-ish response to temperature, 0–1.
 * Plain English: grass grows fastest at optimalTempC (20°C). The further
 * away the actual temperature is (in either direction — too cold OR too
 * hot), the slower it grows. Below minGrowthTempC (2°C) it stops entirely —
 * that's winter dormancy.
 */
const computeTemperatureFactor = (temperatureC: number): number => {
  if (temperatureC < GROWTH.minGrowthTempC) return 0;
  const delta = temperatureC - GROWTH.optimalTempC;
  return Math.exp(-GROWTH.tempSensitivity * delta * delta);
};

/**
 * Soil moisture (0–1 bucket) limits growth below a comfortable threshold.
 * Plain English: once soil moisture is at 0.6 (60% of the root zone's water
 * capacity) or higher, water isn't the bottleneck and this factor maxes out
 * at 1. Below that, growth is throttled proportionally — drier ground grows
 * grass more slowly, all else equal.
 */
const computeMoistureFactor = (soilMoisture: number): number => {
  return Math.max(0, Math.min(1, soilMoisture / 0.6));
};

/**
 * Advances one cell's grass biomass by one simulated hour of growth.
 * Does NOT apply grazing removal — that's grazing.ts's job, called
 * separately so the two effects stay independently testable.
 */
export const growGrassOneHour = (cell: PastureCell, weather: Weather): PastureCell => {
  const temperatureFactor = computeTemperatureFactor(weather.temperatureC);
  const moistureFactor = computeMoistureFactor(cell.soilMoisture);

  // Combine all three conditions multiplicatively: if ANY one of them is
  // bad (e.g. temperatureFactor near 0 in winter), growth is slow no matter
  // how good the others are. rootHealth directly throttles growth rate —
  // this is the mechanical consequence of overgrazing forcing the plant to
  // draw down root reserves instead of growing new leaf.
  // Floor at 0.02 so even fully destroyed roots allow ~2% of normal growth —
  // enough to slowly break the deadlock where rootHealth=0 prevents biomass
  // from ever recovering, which in turn prevents rootHealth from ever
  // recovering (a permanent dead state). At 2% it still takes years; it's
  // punishing, just not permanently unrecoverable.
  const growthRate =
    GROWTH.baseRatePerHour * temperatureFactor * moistureFactor * Math.max(0.02, cell.rootHealth);

  // The "logistic" part: growth slows down as biomass approaches the max.
  // At low biomass (little grass) this term is small too — not much leaf
  // area yet to photosynthesise with. It peaks around the halfway point
  // (biomass = maxBiomass / 2) and shrinks toward 0 again near the ceiling.
  // This S-shaped growth curve is what real pasture growth looks like.
  //
  // SEED_BIOMASS_KG_HA: adding a small constant before multiplying prevents
  // the "logistic growth from zero" deadlock. Pure logistic growth at biomass=0
  // is always exactly 0 (nothing to photosynthesise with), so a perfectly bare
  // paddock could never restart even with healthy soil, moisture, and roots.
  // The seed term represents dormant seeds and dormant root buds that are
  // always present in the soil and can sprout independently of standing biomass.
  // 5 kg/ha is tiny — at peak conditions it contributes < 0.02 kg/ha/hour —
  // but it gives recovery something to build on.
  const SEED_BIOMASS_KG_HA = 5;
  const logisticTerm =
    (cell.grassBiomassKgHa + SEED_BIOMASS_KG_HA) *
    (1 - cell.grassBiomassKgHa / cell.maxBiomassKgHa);
  const deltaBiomass = growthRate * logisticTerm;

  // Add this hour's growth, but never let biomass go negative or exceed
  // the cell's own ceiling.
  const grassBiomassKgHa = Math.max(
    0,
    Math.min(cell.maxBiomassKgHa, cell.grassBiomassKgHa + deltaBiomass),
  );

  return { ...cell, grassBiomassKgHa };
};

/**
 * Soil moisture bucket update: rain adds, a fixed evapotranspiration rate
 * drains it (higher in heat/sunlight). Simple, not a real water-balance model.
 */
export const updateSoilMoistureOneHour = (cell: PastureCell, weather: Weather): PastureCell => {
  // Think of soilMoisture as a bucket (the "root zone") that fills with
  // rain and drains through evapotranspiration (water lost to sun/heat/
  // plants). This function just does that bucket math for one hour.
  const rainMmPerHour = weather.rainfallMm / 24;

  // Reference evapotranspiration, mm/day: a baseline plus sunlight and
  // heat terms. Lands around 2.5 mm/day in spring and 3.9 in summer,
  // matching typical temperate-grassland ET.
  const evapotranspirationMmPerDay =
    1.5 + (weather.sunlightHours / 12) * 2 + Math.max(0, weather.temperatureC - 15) / 10;
  const evapotranspirationMmPerHour = evapotranspirationMmPerDay / 24;

  // Net change this hour = rain in minus water lost, converted from mm of
  // water into a fraction of the bucket's total capacity (ROOT_ZONE_CAPACITY_MM).
  const netMmPerHour = rainMmPerHour - evapotranspirationMmPerHour;
  const soilMoisture = Math.max(
    0,
    Math.min(1, cell.soilMoisture + netMmPerHour / ROOT_ZONE_CAPACITY_MM),
  );

  return { ...cell, soilMoisture };
};

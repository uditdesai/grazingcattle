/** One cell of the farm's grid. The unit the simulation actually operates on. */
export type PastureCell = {
  id: string;
  x: number;
  y: number;

  /** Standing grass biomass, kg dry matter per hectare. */
  grassBiomassKgHa: number;
  /** Logistic growth ceiling for this cell, kg DM/ha. */
  maxBiomassKgHa: number;

  /**
   * 0–1. Depressed when grazing utilization exceeds ~50% ("take half,
   * leave half"). Suppresses future grass growthRate — this is the
   * mechanical link between overgrazing and slow recovery.
   */
  rootHealth: number;

  /** 0–1. Non-monotonic w.r.t. grazing intensity — peaks at moderate use. */
  soilHealth: number;

  /** 0–1 bucket. Rain fills it, evapotranspiration drains it. */
  soilMoisture: number;

  /** 0–1. Replenished by manure deposits, consumed by grass growth. */
  nutrients: number;

  /** 0–1. Slow-moving; rewards sustained good management. */
  biodiversity: number;

  /** Simulation hour of last grazing / manure event, or null if never. */
  lastGrazedAt: number | null;
  lastManuredAt: number | null;
};

/**
 * A player-defined group of cells enclosed by fencing. In this milestone
 * paddocks are fixed scenario data; from Milestone 4 on, fence geometry
 * computes cellIds instead — this type doesn't change.
 */
export type Paddock = {
  id: string;
  name: string;
  cellIds: string[];
};

import type { Season } from "./Weather";

type BaseEvent = {
  id: string;
  farmId: string;
  /** Simulation hour this event occurred at. */
  simHour: number;
};

export type FarmEvent =
  | (BaseEvent & { type: "CALF_BORN"; data: { calfId: string; motherId: string } })
  | (BaseEvent & { type: "COW_SOLD"; data: { cowId: string; priceUsd: number } })
  | (BaseEvent & {
      type: "COW_DIED";
      data: { cowId: string; cause: "old_age" | "disease" | "injury" | "malnutrition" };
    })
  | (BaseEvent & { type: "HEAVY_RAIN"; data: { rainfallMm: number } })
  | (BaseEvent & { type: "PASTURE_DEGRADED"; data: { cellId: string } })
  | (BaseEvent & { type: "PASTURE_RECOVERED"; data: { cellId: string } })
  | (BaseEvent & { type: "DISEASE_DETECTED"; data: { cowId: string; disease: string } })
  | (BaseEvent & { type: "FENCE_MOVED"; data: { paddockId: string; cellIds: string[] } })
  | (BaseEvent & { type: "SEASON_CHANGED"; data: { season: Season } });

export type FarmEventType = FarmEvent["type"];

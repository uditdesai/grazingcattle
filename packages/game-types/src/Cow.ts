export type CowSex = "female" | "male";

export type CowStatus =
  | "calf" // 0–3 mo
  | "juvenile" // 3 mo – 2 yr
  | "breeding" // mature, actively cycling/bred
  | "productive" // mature, stable
  | "old" // declining with age
  | "sold"
  | "slaughtered"
  | "dead";

export type Cow = {
  id: string;
  name?: string;
  sex: CowSex;
  breed: string;

  ageDays: number;
  /** Live body weight, kg. */
  weightKg: number;
  /** Frame size: the weight this animal reaches at maturity in good condition, kg. */
  matureWeightKg: number;
  /** Standard 1–9 body condition score (1 = emaciated, 9 = obese; ~5 is ideal). */
  bodyConditionScore: number;

  /** 0–1 overall health. */
  health: number;
  /** 0–1 base fertility, modified by health/nutrition when checking for breeding. */
  fertility: number;
  pregnant: boolean;
  /** Days into gestation, only meaningful when pregnant. */
  pregnancyDays?: number;

  status: CowStatus;
  /** Which paddock the cow currently occupies, or null if not yet placed. */
  currentPaddockId: string | null;

  /** Simulation hour the cow was born (or entered the farm). */
  birthSimHour: number;
  /** Simulation hour of death/sale, if applicable. */
  exitSimHour?: number;
};

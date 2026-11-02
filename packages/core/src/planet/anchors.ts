// What an anchor of ADR-0002 §3 is made of, and the small set of maps; rows.ts holds the twelve.

export type Rgb = readonly [number, number, number];
export type Ramp = readonly [Rgb, Rgb, Rgb];
type Span = readonly [number, number];

export const ANCHORS = [
  "rocky",
  "temperate",
  "desert",
  "ocean",
  "ice",
  "volcanic",
  "gas giant",
  "ice giant",
  "cloud deck",
  "tidally locked",
  "dark carbon",
  "shattered",
] as const;
export type Anchor = (typeof ANCHORS)[number];

/** The small set of real maps every world reuses. */
export const MAPS = ["mars", "moon", "venus", "jupiter", "ceres", "eris", "neptune", "haze", "earth-day"] as const;
export type MapName = (typeof MAPS)[number];

export interface AnchorRow {
  readonly maps: readonly [MapName, ...MapName[]];
  readonly second: MapName;
  readonly palettes: readonly [Ramp, Ramp];
  readonly warp: Span;
  readonly recolour: Span;
  readonly relief: Span;
  /** 0, a dusty limb that stays bright; 1, a cloudy one that darkens. */
  readonly limb: number;
  /** Above 1, a faint map's bands and clouds are lifted around its own mean. */
  readonly contrast?: Span;
  readonly caps?: Span;
  readonly clouds?: Span;
  readonly rifts?: Span;
  readonly cracks?: Span;
  /** The share of worlds with rings. */
  readonly rings?: number;
  readonly banded?: true;
  readonly locked?: true;
  readonly sea?: { readonly level: Span; readonly shallow: Rgb; readonly deep: Rgb };
  readonly glow?: { readonly colour: Rgb; readonly level: Span };
  readonly rim?: { readonly colours: readonly [Rgb, Rgb]; readonly thickness: Span };
}

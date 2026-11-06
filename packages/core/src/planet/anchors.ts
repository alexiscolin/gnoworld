// What an anchor of ADR-0002 §3 is made of, and the small set of maps; rows.ts holds the twelve of the ADR, more.ts the twelve more.

export type Rgb = readonly [number, number, number];
export type Ramp = readonly [Rgb, Rgb, Rgb];
type Span = readonly [number, number];

const KEPT = [
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
// Each a real body or a documented kind of planet (Alexis, 2026-11-02); the references are in more.ts.
const MORE = [
  "nitrogen ice",
  "grooved ice",
  "snowball",
  "hycean",
  "archean",
  "lava world",
  "two-faced",
  "water cloud giant",
  "azure giant",
  "dark giant",
  "hot giant",
  "sub-Neptune",
] as const;
export const ANCHORS = [...KEPT, ...MORE] as const;
export type Anchor = (typeof ANCHORS)[number];
export type KeptAnchor = (typeof KEPT)[number];
export type MoreAnchor = (typeof MORE)[number];

/** The small set of real maps every world takes its fine detail from; the Earth's is the Earth's alone (F4223). */
export const MAPS = ["mars", "moon", "venus", "jupiter", "ceres", "eris", "neptune", "haze"] as const;
export type MapName = (typeof MAPS)[number];

export interface AnchorRow {
  readonly maps: readonly [MapName, ...MapName[]];
  readonly palettes: readonly [Ramp, Ramp];
  readonly warp: Span;
  readonly recolour: Span;
  readonly relief: Span;
  /** The share of worlds with rings. */
  readonly rings?: number;
  readonly banded?: true;
  readonly locked?: true;
  readonly sea?: { readonly shallow: Rgb; readonly deep: Rgb };
  readonly glow?: { readonly colour: Rgb; readonly level: Span };
  readonly rim?: { readonly colours: readonly [Rgb, Rgb]; readonly thickness: Span };
}

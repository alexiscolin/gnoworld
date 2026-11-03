// Variety is measured, not counted (ADR-0002 §3): a world's feature vector, and whether a glance would take two worlds for one. Its class,
// its minor class while it shows, its palette's centre in Lab, what its surface shows in a still, its rings, its air and the real maps
// it takes its detail from; a colour under 10 in Lab and a value under a tenth of its span are steps a glance misses. The golden over views is server/src/worlds/group.test.ts.
import type { Anchor, MapName } from "./anchors.ts";
import type { PlanetLook } from "./look.ts";
import type { Lab } from "./palette.ts";
import { ofContinents, type Recipe } from "./recipe.ts";
import { SURFACE } from "./spans.ts";

export interface Features {
  readonly anchor: Anchor;
  readonly minor: Anchor;
  /** A world of continents' minor is its bare ground, its climate's in BARE's colours: its class and its map are drawn nowhere. */
  readonly bare: boolean;
  readonly minorShare: number;
  readonly centre: Lab;
  /** Each value a still shows, as its place on its whole span, 0 to 1. */
  readonly shape: readonly number[];
  readonly ringed: boolean;
  readonly air: number;
  /** The real maps it takes its detail from, the dominant's and the minor's. */
  readonly maps: readonly [MapName, MapName];
}

// A cloud's drift and an octave's ratio do not show in a still.
const SHOWN = [
  "scale",
  "roughness",
  "warp",
  "erosion",
  "craters",
  "sea",
  "caps",
  "rifts",
  "bands",
  "turbulence",
  "storms",
  "clouds",
  "detail",
  "halves",
  "mix",
  "gather",
] as const;
const SAME_COLOUR = 10;
const SAME_SHAPE = 0.1;
// A tenth of the minor's 0.4 and of the air's 0.05, written out: 0.4 * 0.1 is not 0.04 in floating point.
const SAME_MINOR = 0.04;
const SAME_AIR = 0.005;

export function featuresOf(look: PlanetLook, recipe: Recipe): Features {
  return {
    anchor: look.anchor,
    minor: recipe.minor,
    bare: ofContinents(recipe.surface),
    minorShare: recipe.minorShare,
    centre: recipe.palette.lab[1],
    shape: SHOWN.map((name) => {
      const [from, to] = SURFACE[name].span;
      return (recipe.surface[name] - from) / (to - from);
    }),
    ringed: look.rings !== null,
    air: look.rim?.thickness ?? 0,
    maps: [look.map, recipe.minorMap],
  };
}

const near = (one: number, other: number, step: number): boolean => Math.abs(one - other) < step;

// Two minors alike: neither shows, both are bare ground, or one class on one map.
const sameMinor = (one: Features, other: Features): boolean =>
  Math.max(one.minorShare, other.minorShare) < SAME_MINOR ||
  (one.bare && other.bare) ||
  (one.minor === other.minor && one.maps[1] === other.maps[1]);

/** Whether a glance would take two worlds for one: every feature within a step it misses. */
export function alike(one: Features, other: Features): boolean {
  const [dl, da, db] = [0, 1, 2].map((at) => (one.centre[at] ?? 0) - (other.centre[at] ?? 0)) as [
    number,
    number,
    number,
  ];
  return (
    one.anchor === other.anchor &&
    one.ringed === other.ringed &&
    one.maps[0] === other.maps[0] &&
    sameMinor(one, other) &&
    dl * dl + da * da + db * db < SAME_COLOUR * SAME_COLOUR &&
    near(one.minorShare, other.minorShare, SAME_MINOR) &&
    near(one.air, other.air, SAME_AIR) &&
    one.shape.every((value, at) => near(value, other.shape[at] ?? Number.NaN, SAME_SHAPE))
  );
}

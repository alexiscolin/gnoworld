import { describe, expect, it } from "vitest";
import { ANCHORS, planetLook, planetSeed, type Anchor, type MapName, type PlanetLook } from "./look.ts";

// Which byte of the seed feeds which value, and each row's spans, stated here apart from look.ts and rows.ts. An approved world stands on them:
// a changed index or number re-rolls every world, and nothing else would say so. The palettes are bounded by look.test.ts, not restated.
type Span = readonly [number, number];
interface Row {
  readonly maps: readonly MapName[];
  readonly warp: Span;
  readonly recolour: Span;
  readonly relief: Span;
  readonly rings?: number;
  readonly glow?: Span;
  readonly rim?: { readonly colours: readonly [number, number]; readonly thickness: Span };
}

const SKY = [0x335289, 0x3a5e8c] as const;
const FLAT: Span = [0, 0];
const STATED: Record<Anchor, Row> = {
  rocky: {
    maps: ["moon", "ceres"],
    warp: [0.02, 0.1],
    recolour: [0.5, 0.9],
    relief: [0.018, 0.03],
    rings: 0.05,
  },
  temperate: {
    maps: ["venus", "mars"],
    warp: [0.08, 0.2],
    recolour: [0.75, 1],
    relief: [0.0042, 0.008],
    rim: { colours: SKY, thickness: [0.04, 0.05] },
  },
  desert: {
    maps: ["mars", "ceres"],
    warp: [0.06, 0.2],
    recolour: [0.35, 0.8],
    relief: [0.014, 0.024],
    rings: 0.04,
    rim: { colours: [0x6e4f35, 0x66402e], thickness: [0.018, 0.03] },
  },
  ocean: {
    maps: ["venus"],
    warp: [0.1, 0.24],
    recolour: [0.8, 1],
    relief: [0.008, 0.014],
    rim: { colours: SKY, thickness: [0.04, 0.05] },
  },
  ice: {
    maps: ["eris"],
    warp: [0.04, 0.14],
    recolour: [0.7, 1],
    relief: [0.012, 0.022],
    rings: 0.04,
  },
  volcanic: {
    maps: ["moon", "ceres"],
    warp: [0.04, 0.14],
    recolour: [0.92, 1],
    relief: [0.012, 0.02],
    glow: [0.5, 0.58],
    rim: { colours: [0x734d26, 0x6e562b], thickness: [0.016, 0.026] },
  },
  "gas giant": {
    maps: ["jupiter"],
    warp: [0.02, 0.08],
    recolour: [0.15, 0.75],
    relief: FLAT,
    rings: 0.5,
    rim: { colours: [0x6b5c47, 0x615e54], thickness: [0.022, 0.03] },
  },
  "ice giant": {
    maps: ["neptune"],
    warp: [0.02, 0.08],
    recolour: [0.3, 0.9],
    relief: FLAT,
    rings: 0.45,
    rim: { colours: [0x36547a, 0x477173], thickness: [0.03, 0.04] },
  },
  "cloud deck": {
    maps: ["haze"],
    warp: [0.06, 0.16],
    recolour: [0.3, 0.8],
    relief: FLAT,
    rim: { colours: [0x796643, 0x765430], thickness: [0.04, 0.05] },
  },
  "tidally locked": {
    maps: ["mars", "ceres"],
    warp: [0.06, 0.18],
    recolour: [0.55, 0.9],
    relief: [0.014, 0.024],
    rim: { colours: [0x5c4d4f, 0x4d4f64], thickness: [0.02, 0.032] },
  },
  "dark carbon": {
    maps: ["ceres"],
    warp: [0.04, 0.14],
    recolour: [0.85, 1],
    relief: [0.022, 0.034],
    rings: 0.03,
  },
  shattered: {
    maps: ["moon"],
    warp: [0.08, 0.2],
    recolour: [0.7, 1],
    relief: [0.02, 0.032],
    glow: [0.3, 0.6],
  },
  // The twelve more (7b4) draw, until 7b5, on a kept anchor's row in their own colours: these are those rows, a few values moved.
  "nitrogen ice": {
    maps: ["eris"],
    warp: [0.04, 0.14],
    recolour: [0.85, 1],
    relief: [0.012, 0.022],
    rings: 0.04,
  },
  "grooved ice": {
    maps: ["eris"],
    warp: [0.04, 0.14],
    recolour: [0.85, 1],
    relief: [0.012, 0.022],
    rings: 0.04,
  },
  snowball: {
    maps: ["eris"],
    warp: [0.04, 0.14],
    recolour: [0.85, 1],
    relief: [0.012, 0.022],
    rings: 0.04,
    rim: { colours: SKY, thickness: [0.015, 0.025] },
  },
  hycean: {
    maps: ["venus"],
    warp: [0.1, 0.24],
    recolour: [0.8, 1],
    relief: [0.008, 0.014],
    rim: { colours: SKY, thickness: [0.04, 0.05] },
  },
  archean: {
    maps: ["venus", "mars"],
    warp: [0.16, 0.24],
    recolour: [0.75, 1],
    relief: [0.0042, 0.008],
    rim: { colours: [0x7a5226, 0x80592c], thickness: [0.04, 0.05] },
  },
  "lava world": {
    maps: ["moon", "ceres"],
    warp: [0.04, 0.14],
    recolour: [0.92, 1],
    relief: [0.012, 0.02],
    glow: [0.6, 0.72],
    rim: { colours: [0x734d26, 0x6e562b], thickness: [0.016, 0.026] },
  },
  "two-faced": {
    maps: ["moon", "ceres"],
    warp: [0.02, 0.1],
    recolour: [0.85, 1],
    relief: [0.018, 0.03],
    rings: 0.05,
  },
  "water cloud giant": {
    maps: ["jupiter"],
    warp: [0.02, 0.08],
    recolour: [0.7, 1],
    relief: FLAT,
    rings: 0.5,
    rim: { colours: [0x6b5c47, 0x615e54], thickness: [0.022, 0.03] },
  },
  "azure giant": {
    maps: ["neptune"],
    warp: [0.02, 0.08],
    recolour: [0.85, 1],
    relief: FLAT,
    rings: 0.05,
    rim: { colours: [0x36547a, 0x477173], thickness: [0.03, 0.04] },
  },
  "dark giant": {
    maps: ["jupiter"],
    warp: [0.02, 0.08],
    recolour: [0.9, 1],
    relief: FLAT,
    rings: 0.05,
    rim: { colours: [0x6b5c47, 0x615e54], thickness: [0.022, 0.03] },
  },
  "hot giant": {
    maps: ["jupiter"],
    warp: [0.02, 0.08],
    recolour: [0.85, 1],
    relief: FLAT,
    rings: 0.05,
    rim: { colours: [0x6b5c47, 0x615e54], thickness: [0.022, 0.03] },
  },
  "sub-Neptune": {
    maps: ["neptune"],
    warp: [0.02, 0.08],
    recolour: [0.85, 1],
    relief: FLAT,
    rings: 0.05,
    rim: { colours: [0x36547a, 0x477173], thickness: [0.03, 0.04] },
  },
};

const ascii = (text: string): Uint8Array => Uint8Array.from(text, (character) => character.charCodeAt(0));
const paths = (count: number): Uint8Array[] =>
  Array.from({ length: count }, (_, i) => ascii(`gno.land/r/demo/stated${String(i)}`));
const within = ([from, to]: Span, share: number) => from + (to - from) * share;
const channels = (hex: number) => [(hex >> 16) & 255, (hex >> 8) & 255, hex & 255].map((channel) => channel / 255);
const near = (actual: number | undefined, wanted: number) => {
  expect(actual).toBeCloseTo(wanted, 9);
};
const bytesOf = (path: Uint8Array) => {
  const seed = planetSeed(path);
  return (index: number) => (seed[index] ?? Number.NaN) / 255;
};
type Byte = ReturnType<typeof bytesOf>;

function holdsMaps(look: PlanetLook, row: Row, path: Uint8Array) {
  const first = (planetSeed(path)[23] ?? Number.NaN) < 128;
  expect(look.map).toBe(row.maps[first || row.maps.length === 1 ? 0 : 1]);
}

function holdsSurface(look: PlanetLook, row: Row, byte: Byte) {
  near(look.warp.amount, within(row.warp, byte(14)));
  near(look.warp.frequency, within([0.9, 2.4], byte(30)));
  near(look.recolour, within(row.recolour, byte(19)));
  near(look.relief, within(row.relief, byte(17)));
  for (const [axis, at] of [18, 20, 22].entries()) near(look.minorOffset[axis as 0 | 1 | 2], byte(at) * 16);
  near(look.tilt, (byte(16) * 2 - 1) * 0.45);
}

function holdsRim(look: PlanetLook, { colours: [one, other], thickness }: NonNullable<Row["rim"]>, byte: Byte) {
  near(look.rim?.thickness, within(thickness, byte(21)));
  const far = channels(other);
  for (const [channel, from] of channels(one).entries())
    near(look.rim?.colour[channel as 0 | 1 | 2], within([from, far[channel] ?? 0], byte(31)));
}

function holdsAir(look: PlanetLook, row: Row, byte: Byte) {
  expect(look.glow !== null).toBe(row.glow !== undefined);
  if (row.glow !== undefined) near(look.glow?.level, within(row.glow, byte(29)));
  expect(look.rim !== null).toBe(row.rim !== undefined);
  if (row.rim !== undefined) holdsRim(look, row.rim, byte);
}

function holdsRings(look: PlanetLook, row: Row, byte: Byte) {
  const ringed = byte(24) < (row.rings ?? 0);
  expect(look.rings !== null).toBe(ringed);
  const share = byte(13) * 2 - 1;
  near(look.lean, ringed ? (0.3 + 0.35 * Math.abs(share)) * (share < 0 ? -1 : 1) : share * 0.25);
  if (look.rings === null) return;
  const inner = within([1.25, 1.45], byte(25));
  near(look.rings.inner, inner);
  near(look.rings.outer, inner + within([0.62, 0.95], byte(26)));
  near(look.rings.opacity, within([0.34, 0.72], byte(28)));
  const [, mid, high] = look.ramp;
  for (const channel of [0, 1, 2] as const)
    near(look.rings.tint[channel], within([high[channel], mid[channel]], byte(27)));
}

describe("a row's bytes and spans", () => {
  it.each([...ANCHORS])("%s reads each value from the byte and the span stated here", (anchor) => {
    const row = STATED[anchor];
    for (const path of paths(60)) {
      const byte = bytesOf(path);
      const look = planetLook(path, anchor);
      holdsMaps(look, row, path);
      holdsSurface(look, row, byte);
      holdsAir(look, row, byte);
      holdsRings(look, row, byte);
    }
  });

  it("tries both signs of a lean, with rings and without, and both maps", () => {
    const seeds = paths(60).map((path) => planetSeed(path));
    expect(seeds.some((seed) => (seed[13] ?? 0) < 128)).toBe(true);
    expect(seeds.some((seed) => (seed[13] ?? 0) >= 128)).toBe(true);
    expect(seeds.some((seed) => (seed[23] ?? 0) < 128)).toBe(true);
    expect(seeds.some((seed) => (seed[23] ?? 0) >= 128)).toBe(true);
    const looks = paths(60).map((path) => planetLook(path, "gas giant"));
    expect(looks.some(({ rings }) => rings === null)).toBe(true);
    expect(looks.some(({ rings }) => rings !== null)).toBe(true);
  });

  it("gives no rings to a row with no share of them, even at a byte of 0", () => {
    const path = Array.from({ length: 4000 }, (_, i) => ascii(`gno.land/r/demo/ringless${String(i)}`)).find(
      (candidate) => planetSeed(candidate)[24] === 0,
    );
    if (path === undefined) throw new Error("no path with a byte 24 of 0 in 4000");
    for (const anchor of ANCHORS)
      expect(planetLook(path, anchor).rings !== null, anchor).toBe("rings" in STATED[anchor]);
  });
});

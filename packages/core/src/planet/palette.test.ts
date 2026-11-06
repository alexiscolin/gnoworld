import fc from "fast-check";
import { describe, expect, it } from "vitest";
import type { AnchorRow } from "./anchors.ts";
import { ANCHORS, asciiBytes, planetSeed, type Anchor } from "./look.ts";
import { labOf, linearOf, type Lab } from "./palette.ts";
import { starWarmth } from "../cosmos/warmth.ts";
import { plantsOf, planetRecipe } from "./recipe.ts";
import { ROWS } from "./rows.ts";
import { sha256 } from "./sha256.ts";

// Layer 3 (slice 7, 7b4; ADR-0002 §3): a world's palette is its anchor's two real ramps interpolated in Lab, its lightness and chroma
// graded by the seed, never past its sources' chroma, and turned by its namespace's hue, at most 12 degrees, the same for a whole
// system. The formulas are restated here with Math's own cube root and power; the code reaches them with + - * / alone.
type Rgb = readonly [number, number, number];
const WHITE = [0.95047, 1, 1.08883] as const;
const EDGE = 6 / 29;
const decoded = (channel: number) => (channel <= 0.04045 ? channel / 12.92 : ((channel + 0.055) / 1.055) ** 2.4);
const curve = (value: number) => (value > EDGE ** 3 ? Math.cbrt(value) : value / (3 * EDGE * EDGE) + 4 / 29);

function cieLab([red, green, blue]: Rgb): Lab {
  const [r, g, b] = [decoded(red), decoded(green), decoded(blue)];
  const x = curve((0.4124564 * r + 0.3575761 * g + 0.1804375 * b) / WHITE[0]);
  const y = curve(0.2126729 * r + 0.7151522 * g + 0.072175 * b);
  const z = curve((0.0193339 * r + 0.119192 * g + 0.9503041 * b) / WHITE[2]);
  return [116 * y - 16, 500 * (x - y), 200 * (y - z)];
}

const chroma = ([, a, b]: Lab) => Math.hypot(a, b);
const hue = ([, a, b]: Lab) => Math.atan2(b, a);
const DEGREE = Math.PI / 180;
const turnBetween = (from: Lab, to: Lab) => {
  const turn = hue(to) - hue(from);
  return turn > Math.PI ? turn - 2 * Math.PI : turn < -Math.PI ? turn + 2 * Math.PI : turn;
};
const lerp = (from: number, to: number, share: number) => from + (to - from) * share;
const byteOf = (bytes: Uint8Array, index: number): number => {
  const byte = bytes[index];
  if (byte === undefined) throw new Error("no such byte");
  return byte;
};
const word = (bytes: Uint8Array, index: number) =>
  (byteOf(bytes, index * 2) * 256 + byteOf(bytes, index * 2 + 1)) / 65535;
const inSystem = (namespace: string, count: number) =>
  Array.from({ length: count }, (_, at) => asciiBytes(`gno.land/r/${namespace}/world${String(at)}`));
const share = fc.double({ min: 0, max: 1, noNaN: true });
const anyColour = fc.tuple(share, share, share);
// A path anywhere, or one in a system: the turn reaches only the second.
const anyPath = fc.oneof(
  fc.uint8Array({ maxLength: 64 }),
  fc.stringMatching(/^[a-z0-9_-]{1,24}(?:\/[a-z0-9_-]{1,24}){0,2}$/).map((id) => asciiBytes(`gno.land/r/${id}`)),
);

// The ungraded, unturned colour of two ramps (a row's palette, or the plants a world grows) at a seed: what the grade and the hue move.
const plainOf = ([one, other]: AnchorRow["palettes"], seed: Uint8Array, at: 0 | 1 | 2): Lab => {
  const [from, to] = [cieLab(one[at]), cieLab(other[at])];
  const blend = word(seed, 6);
  return [lerp(from[0], to[0], blend), lerp(from[1], to[1], blend), lerp(from[2], to[2], blend)];
};
const plainLab = (anchor: Anchor, seed: Uint8Array, at: 0 | 1 | 2): Lab => plainOf(ROWS[anchor].palettes, seed, at);
// The grade a seed gives: its lightness and its chroma, from the second hash's bytes 28 and 29.
const gradeOf = (seed: Uint8Array) => {
  const more = sha256(seed);
  return { lightness: lerp(0.9, 1.1, byteOf(more, 28) / 255), chroma: lerp(0.8, 1, byteOf(more, 29) / 255) };
};

describe("Lab", () => {
  it("reads an sRGB colour as CIE Lab under D65, as the formulas give it", () => {
    fc.assert(
      fc.property(anyColour, (colour) => {
        const [l, a, b] = labOf(colour);
        const [wantL, wantA, wantB] = cieLab(colour);
        expect(l).toBeCloseTo(wantL, 6);
        expect(a).toBeCloseTo(wantA, 6);
        expect(b).toBeCloseTo(wantB, 6);
      }),
    );
  });

  // The values published for sRGB's primaries under D65 (Bruce Lindbloom's tables), to two digits: not read in this session.
  it.each([
    [
      [1, 0, 0],
      [53.24, 80.09, 67.2],
    ],
    [
      [0, 1, 0],
      [87.73, -86.18, 83.18],
    ],
    [
      [0, 0, 1],
      [32.3, 79.19, -107.86],
    ],
  ] as const)("reads the primary %j as its published Lab", (colour, wanted) => {
    const lab = labOf(colour);
    for (const [at, value] of wanted.entries()) expect(Math.abs((lab[at] ?? Number.NaN) - value)).toBeLessThan(0.02);
  });

  it("reads every grey a byte can hold, black and white at the ends", () => {
    for (let byte = 0; byte < 256; byte += 1) {
      const grey = byte / 255;
      const [l, a, b] = labOf([grey, grey, grey]);
      expect(l).toBeCloseTo(cieLab([grey, grey, grey])[0], 6);
      expect(Math.abs(a)).toBeLessThan(1e-3);
      expect(Math.abs(b)).toBeLessThan(1e-3);
    }
    expect(labOf([0, 0, 0])[0]).toBeCloseTo(0, 9);
    expect(labOf([1, 1, 1])[0]).toBeCloseTo(100, 4);
  });

  it("gives a Lab colour back as linear sRGB, the space three draws in", () => {
    fc.assert(
      fc.property(anyColour, (colour) => {
        const linear = linearOf(labOf(colour));
        for (const [channel, value] of colour.entries()) expect(linear[channel]).toBeCloseTo(decoded(value), 5);
      }),
    );
  });

  it("keeps what lies past sRGB inside it", () => {
    for (const lab of [
      [100, 80, 80],
      [50, -128, 127],
      [0, 60, -60],
      [120, 0, 0],
    ] as const)
      for (const channel of linearOf(lab)) {
        expect(channel).toBeGreaterThanOrEqual(0);
        expect(channel).toBeLessThanOrEqual(1);
      }
  });
});

describe("a world's palette", () => {
  it.each([...ANCHORS])(
    "%s: its row's two ramps in Lab at the seed's word 6, lightness and chroma graded",
    (anchor) => {
      for (let at = 0; at < 40; at += 1) {
        const path = asciiBytes(`outside/${String(at)}`);
        const seed = planetSeed(path);
        const { lightness, chroma: graded } = gradeOf(seed);
        const { palette } = planetRecipe(path, anchor);
        for (const index of [0, 1, 2] as const) {
          const [l, a, b] = plainLab(anchor, seed, index);
          const [gotL, gotA, gotB] = palette.lab[index];
          expect(gotL).toBeCloseTo(Math.min(100, l * lightness), 6);
          expect(gotA).toBeCloseTo(a * graded, 6);
          expect(gotB).toBeCloseTo(b * graded, 6);
          expect(palette.linear[index]).toEqual(linearOf(palette.lab[index]));
        }
      }
    },
  );

  it("paints the minor class's regions in its own palette, graded alike", () => {
    for (let at = 0; at < 200; at += 1) {
      const path = asciiBytes(`gno.land/r/minor/world${String(at)}`);
      const recipe = planetRecipe(path, "rocky");
      expect(recipe.minorPalette).toEqual(planetRecipe(path, recipe.minor).palette);
    }
  });

  // The sources are the ramps the world grows: its row's, or a temperate world's other plants by its realm namespace's star.
  const sourcesOf = (path: Uint8Array, anchor: Anchor) => {
    const namespace = /^gno\.land\/r\/([^/]+)/.exec(String.fromCharCode(...path))?.[1];
    return plantsOf(sha256(planetSeed(path)), anchor, namespace === undefined ? undefined : starWarmth(namespace));
  };
  const bounded = (path: Uint8Array, anchor: Anchor) => {
    const { palette } = planetRecipe(path, anchor);
    const [one, other] = sourcesOf(path, anchor);
    for (const index of [0, 1, 2] as const) {
      const most = Math.max(chroma(cieLab(one[index])), chroma(cieLab(other[index])));
      expect(chroma(palette.lab[index])).toBeLessThanOrEqual(most + 1e-6);
      expect(palette.lab[index][0]).toBeGreaterThanOrEqual(0);
      expect(palette.lab[index][0]).toBeLessThanOrEqual(100);
      for (const channel of palette.linear[index]) {
        expect(channel).toBeGreaterThanOrEqual(0);
        expect(channel).toBeLessThanOrEqual(1);
      }
    }
  };

  it("holds a temperate world's chroma to its own purple plants', not the Earth's row's (gno.land/r/__/kx6__all_6r)", () => {
    bounded(asciiBytes("gno.land/r/__/kx6__all_6r"), "temperate");
  });

  it("never grows a colour's chroma past its sources': plausible, never neon, in a system or out of one", () => {
    fc.assert(fc.property(anyPath, fc.constantFrom(...ANCHORS), bounded));
  });

  it("spreads lightness and chroma over their whole grade", () => {
    const paths = Array.from({ length: 400 }, (_, at) => asciiBytes(`outside/spread${String(at)}`));
    const ratios = paths.map((path) => {
      const seed = planetSeed(path);
      const lab = planetRecipe(path, "desert").palette.lab[1];
      const plain = plainLab("desert", seed, 1);
      return { lightness: lab[0] / plain[0], chroma: chroma(lab) / chroma(plain) };
    });
    expect(Math.min(...ratios.map(({ lightness }) => lightness))).toBeLessThan(0.91);
    expect(Math.max(...ratios.map(({ lightness }) => lightness))).toBeGreaterThan(1.09);
    expect(Math.min(...ratios.map(({ chroma: one }) => one))).toBeLessThan(0.81);
    expect(Math.max(...ratios.map(({ chroma: one }) => one))).toBeGreaterThan(0.99);
  });
});

describe("a namespace's hue (ADR-0002 §3)", () => {
  // Each turned colour of a system's worlds, beside its unturned one and the grade its seed gives.
  const turned = (namespace: string, anchors: readonly Anchor[]) =>
    inSystem(namespace, 30).flatMap((path, at) => {
      const anchor = anchors[at % anchors.length] ?? "rocky";
      const seed = planetSeed(path);
      const { palette } = planetRecipe(path, anchor);
      const plants = plantsOf(sha256(seed), anchor, starWarmth(namespace));
      return ([0, 1, 2] as const)
        .filter((index) => chroma(plainOf(plants, seed, index)) > 4)
        .map((index) => ({
          plain: plainOf(plants, seed, index),
          got: palette.lab[index],
          grade: gradeOf(seed),
        }));
    });
  const turns = (namespace: string, anchors: readonly Anchor[]) =>
    turned(namespace, anchors).map(({ plain, got }) => turnBetween(plain, got));

  it("turns every planet of a system by one angle, within 12 degrees, so they look related", () => {
    for (const namespace of ["gnoswap", "samcrew", "nym-moultest123", "g1magld5ptgzaktqcexxq0pgq5lmdf0kz6re8hlv"]) {
      const angles = turns(namespace, ANCHORS);
      const [first = Number.NaN] = angles;
      expect(Math.abs(first)).toBeLessThanOrEqual(12 * DEGREE + 1e-9);
      for (const angle of angles) expect(angle).toBeCloseTo(first, 9);
    }
  });

  it("turns the hue alone: in a system, lightness and chroma are what the grade gives", () => {
    for (const { plain, got, grade } of turned("samcrew", ANCHORS)) {
      expect(got[0]).toBeCloseTo(Math.min(100, plain[0] * grade.lightness), 6);
      expect(chroma(got)).toBeCloseTo(chroma(plain) * grade.chroma, 6);
    }
  });

  it("reads the namespace alone: a deeper folder, another world of it or none keeps the turn", () => {
    const [one] = turns("samcrew", ["desert"]);
    for (const text of ["gno.land/r/samcrew/memba/v2/feed", "gno.land/r/samcrew", "gno.land/r/samcrew/"]) {
      const path = asciiBytes(text);
      const lab = planetRecipe(path, "desert").palette.lab[1];
      expect(turnBetween(plainLab("desert", planetSeed(path), 1), lab), text).toBeCloseTo(one ?? Number.NaN, 9);
    }
  });

  it("gives systems turns over the whole span, both ways", () => {
    const firsts = Array.from({ length: 300 }, (_, at) => turns(`ns${String(at)}`, ["desert"])[0] ?? 0);
    expect(Math.min(...firsts)).toBeLessThan(-10 * DEGREE);
    expect(Math.max(...firsts)).toBeGreaterThan(10 * DEGREE);
    for (const angle of firsts) expect(Math.abs(angle)).toBeLessThanOrEqual(12 * DEGREE + 1e-9);
  }, 30_000);

  it("is sha256 of its own domain and the namespace, so no world's bytes feed it", () => {
    const domain = asciiBytes("gnoworld/system/v1");
    const name = asciiBytes("gnoswap");
    const message = new Uint8Array(domain.length + name.length);
    message.set(domain);
    message.set(name, domain.length);
    const angle = 2 * Math.atan((word(sha256(message), 0) * 2 - 1) * Math.tan(6 * DEGREE));
    expect(turns("gnoswap", ["desert"])[0]).toBeCloseTo(angle, 9);
  });

  it("turns a long namespace or one past ASCII within 12 degrees too", () => {
    const long = new Uint8Array([...asciiBytes("gno.land/r/"), ...new Uint8Array(100_000).fill(0x61), 0x2f, 0x61]);
    const wide = Uint8Array.from([...asciiBytes("gno.land/r/caf"), 0xc3, 0xa9, 0x2f, 0x61]);
    for (const path of [long, wide]) {
      const lab = planetRecipe(path, "desert").palette.lab[1];
      expect(Math.abs(turnBetween(plainLab("desert", planetSeed(path), 1), lab))).toBeLessThanOrEqual(
        12 * DEGREE + 1e-9,
      );
    }
  });

  it("turns nothing outside a system: a path that is no realm's, or an empty namespace", () => {
    const outside = [
      "gno.land/p/demo/avl",
      "gno.land/r/",
      "gno.land/r//x",
      "gno.land/rr/x",
      "gno.land/R/x",
      "Gno.land/r/x",
      "",
    ];
    const coloured = ([0, 1, 2] as const).flatMap((index) => ANCHORS.map((anchor) => ({ anchor, index })));
    for (const text of outside)
      for (const { anchor, index } of coloured) {
        const path = asciiBytes(text);
        const plain = plainLab(anchor, planetSeed(path), index);
        const turn = turnBetween(plain, planetRecipe(path, anchor).palette.lab[index]);
        if (chroma(plain) > 4) expect(turn, text).toBeCloseTo(0, 9);
      }
  });
});

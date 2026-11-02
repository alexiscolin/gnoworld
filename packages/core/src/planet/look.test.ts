import fc from "fast-check";
import { describe, expect, it } from "vitest";
import {
  anchorOf,
  ANCHORS,
  asciiBytes,
  MAPS,
  MAX_WARP_FREQUENCY,
  planetLook,
  planetSeed,
  seededLook,
  worldLook,
  type Anchor,
  type MapName,
  type PlanetLook,
} from "./look.ts";
import { labOf, NO_TURN } from "./palette.ts";
import { planetRecipe, seededRecipe } from "./recipe.ts";
import { ROWS } from "./rows.ts";

// core/planet, its realism part (slice 7, 7b; ADR-0002 §3): a look is a pure function of a path, through
// sha256("gnoworld/planet/v1" ‖ path). The anchor is given here: choosing it from the seed is 7b2.
const ascii = (text: string): Uint8Array => Uint8Array.from(text, (character) => character.charCodeAt(0));
const hex = (bytes: Uint8Array): string => Array.from(bytes, (byte) => byte.toString(16).padStart(2, "0")).join("");
const TURN = Math.PI * 2;
const DAO = ascii("gno.land/r/gov/dao");
const paths = (count: number): Uint8Array[] =>
  Array.from({ length: count }, (_, i) => ascii(`gno.land/r/demo/world${String(i)}`));
const anyPath = fc.uint8Array({ maxLength: 256 });
const anyAnchor = fc.constantFrom(...ANCHORS);
const colours = (look: PlanetLook) => [
  ...look.ramp,
  ...(look.sea === null ? [] : [look.sea.shallow, look.sea.deep]),
  ...(look.glow === null ? [] : [look.glow.colour]),
  ...(look.rim === null ? [] : [look.rim.colour]),
  ...(look.rings === null ? [] : [look.rings.tint]),
];
const ringShare = (anchor: Anchor) =>
  paths(2000).filter((path) => planetLook(path, anchor).rings !== null).length / 2000;
const spread = (values: number[]) => Math.max(...values) - Math.min(...values);

// What each anchor must be, whatever its seed: ADR-0002 §3's list. "Shattered" has fissures and no debris in orbit (§10: debris is
// only a far belt, for dust is a sign).
const READS: Record<Anchor, { sea: boolean; glow: boolean; air: boolean; maps: readonly MapName[] }> = {
  rocky: { sea: false, glow: false, air: false, maps: ["moon", "ceres"] },
  temperate: { sea: true, glow: false, air: true, maps: ["venus", "mars"] },
  desert: { sea: false, glow: false, air: true, maps: ["mars", "ceres"] },
  ocean: { sea: true, glow: false, air: true, maps: ["venus"] },
  ice: { sea: false, glow: false, air: false, maps: ["eris"] },
  volcanic: { sea: false, glow: true, air: true, maps: ["venus"] },
  "gas giant": { sea: false, glow: false, air: true, maps: ["jupiter"] },
  "ice giant": { sea: false, glow: false, air: true, maps: ["neptune"] },
  "cloud deck": { sea: false, glow: false, air: true, maps: ["haze"] },
  "tidally locked": { sea: false, glow: false, air: true, maps: ["mars", "ceres"] },
  "dark carbon": { sea: false, glow: false, air: false, maps: ["ceres"] },
  shattered: { sea: false, glow: true, air: false, maps: ["moon"] },
  "nitrogen ice": { sea: false, glow: false, air: false, maps: ["eris"] },
  "grooved ice": { sea: false, glow: false, air: false, maps: ["eris"] },
  snowball: { sea: false, glow: false, air: true, maps: ["eris"] },
  hycean: { sea: true, glow: false, air: true, maps: ["venus"] },
  archean: { sea: true, glow: false, air: true, maps: ["venus", "mars"] },
  "lava world": { sea: false, glow: true, air: true, maps: ["venus"] },
  "two-faced": { sea: false, glow: false, air: false, maps: ["moon", "ceres"] },
  "water cloud giant": { sea: false, glow: false, air: true, maps: ["jupiter"] },
  "azure giant": { sea: false, glow: false, air: true, maps: ["neptune"] },
  "dark giant": { sea: false, glow: false, air: true, maps: ["jupiter"] },
  "hot giant": { sea: false, glow: false, air: true, maps: ["jupiter"] },
  "sub-Neptune": { sea: false, glow: false, air: true, maps: ["neptune"] },
};

const BANDED: readonly Anchor[] = [
  "gas giant",
  "ice giant",
  "cloud deck",
  "water cloud giant",
  "azure giant",
  "dark giant",
  "hot giant",
  "sub-Neptune",
];

describe("a world's look, from its id", () => {
  const paths = (count: number) => Array.from({ length: count }, (_, at) => `gno.land/r/n${String(at)}/home`);
  const seedOf = (path: string) => planetSeed(asciiBytes(path));

  it("spells a text's bytes for a seed: an id is ASCII by its schema", () => {
    expect([...asciiBytes("a/z-0")]).toEqual([97, 47, 122, 45, 48]);
  });

  it("reads the world's look at its path on gno.land, the anchor from the seed", () => {
    const id = "gnoswap/pool";
    const seed = seedOf(`gno.land/r/${id}`);
    expect(worldLook(id)).toEqual(planetLook(asciiBytes(`gno.land/r/${id}`), anchorOf(seed)));
  });

  it("gives every anchor some worlds, and keeps the strange ones rare: about one in ten (ADR-0002 §3)", () => {
    const seen = new Map<Anchor, number>();
    const seeds = paths(6000).map(seedOf);
    for (const seed of seeds) seen.set(anchorOf(seed), (seen.get(anchorOf(seed)) ?? 0) + 1);
    expect(new Set(seen.keys())).toEqual(new Set(ANCHORS));
    const STRANGE: readonly Anchor[] = ["tidally locked", "shattered", "lava world", "two-faced", "hot giant"];
    const strange = STRANGE.reduce((sum, anchor) => sum + (seen.get(anchor) ?? 0), 0);
    expect(strange / seeds.length).toBeGreaterThan(0.08);
    expect(strange / seeds.length).toBeLessThan(0.12);
    const common = ANCHORS.filter((anchor) => !STRANGE.includes(anchor));
    for (const anchor of common) expect((seen.get(anchor) ?? 0) / seeds.length).toBeGreaterThan(0.02);
  });
});

describe("planetSeed", () => {
  it("is sha256 of the domain and the path's bytes, side by side", () => {
    expect(hex(planetSeed(DAO))).toBe("e75b568b9186ba4ad2f34bde37cc25e55b749b2d3d0ab30a6c57566bad5ee30e");
  });

  it("takes a path's bytes as they are, beyond ASCII", () => {
    const cafe = Uint8Array.from([...ascii("gno.land/r/caf"), 0xc3, 0xa9]);
    expect(hex(planetSeed(cafe))).toBe("77e22dc6c4cd2ea65ebd87f6070ac800b6a38d4e3ac1df4d49f9e763615d16dd");
  });

  it("reads a path past one block of the hash: its digest, computed apart with Python's hashlib", () => {
    const long = ascii(`gno.land/r/demo/${"a".repeat(100)}`);
    expect(hex(planetSeed(long))).toBe("4b21724e71e5ff8c432addbd5ce98225aaec78f49c02c842893afdf33e3eaba7");
  });

  // 18 bytes of domain: 37 and 38 straddle the first block's padding, 45 and 46 its end, 109 to 111 and 174 the next two.
  it.each([37, 38, 45, 46, 109, 110, 111, 174, 200, 1000])(
    "tells two paths of %i bytes apart by their last byte alone",
    (length) => {
      const path = new Uint8Array(length).fill(0x61);
      const twin = Uint8Array.from(path);
      twin[length - 1] = 0x62;
      expect(hex(planetSeed(twin))).not.toBe(hex(planetSeed(path)));
    },
  );
});

describe("the anchors", () => {
  it("are ADR-0002 §3's twelve in its order, then twelve more from real kinds of planets", () => {
    expect(ANCHORS).toEqual([
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
    ]);
  });

  it("draw on a small set of maps", () => {
    expect(MAPS.length).toBeLessThanOrEqual(9);
    const used = new Set(ANCHORS.flatMap((anchor) => paths(50).flatMap((path) => planetLook(path, anchor).map)));
    expect([...used].sort()).toEqual([...MAPS].sort());
  });

  it("each read as its own world: no two share a ramp", () => {
    const ramps = ANCHORS.map((anchor) => JSON.stringify(planetLook(DAO, anchor).ramp));
    expect(new Set(ramps).size).toBe(ANCHORS.length);
  });

  it.each([...ANCHORS])("%s is what its name says, whatever the seed", (anchor) => {
    const { sea, glow, air, maps } = READS[anchor];
    for (const path of paths(100)) {
      const look = planetLook(path, anchor);
      expect(look.sea !== null, "a sea").toBe(sea);
      expect(look.glow !== null, "a glow").toBe(glow);
      expect(look.rim !== null, "air").toBe(air);
      expect(maps).toContain(look.map);
    }
  });

  it("carries nothing a pixel never reads: a look holds no limb, a sea no level, a banded world no relief", () => {
    for (const anchor of ANCHORS) {
      const look = planetLook(DAO, anchor);
      expect(look).not.toHaveProperty("limb");
      expect(look.sea ?? {}).not.toHaveProperty("level");
      if (BANDED.includes(anchor)) expect(look.relief, anchor).toBe(0);
    }
  });

  it("locks one world alone", () => {
    for (const anchor of ANCHORS) expect(planetLook(DAO, anchor).locked).toBe(anchor === "tidally locked");
  });
});

// Each new anchor reads as its reference by colour (7b4): both its ramps' mid colours in Lab, and Iapetus's two faces by its low and high.
type Span = readonly [number, number];
const REFERENCE: Record<string, { l: Span; a?: Span; b?: Span; chroma?: Span }> = {
  "nitrogen ice": { l: [45, 70], a: [8, 20], b: [10, 25] },
  "grooved ice": { l: [50, 65], chroma: [0, 9] },
  snowball: { l: [70, 85], b: [-20, -10] },
  hycean: { l: [20, 35], b: [-35, -12] },
  archean: { l: [30, 45], a: [5, 15], b: [20, 30] },
  "lava world": { l: [5, 15], a: [8, 18], b: [8, 18] },
  "water cloud giant": { l: [78, 85], chroma: [0, 7] },
  "azure giant": { l: [25, 38], b: [-50, -40] },
  "dark giant": { l: [0, 10] },
  "hot giant": { l: [20, 30], a: [18, 26], b: [20, 30] },
  "sub-Neptune": { l: [58, 66], chroma: [0, 11] },
};
const inside = (value: number, [from, to]: Span) => value >= from && value <= to;

describe("the anchors' colours", () => {
  it.each(Object.keys(REFERENCE))("%s reads as its reference", (anchor) => {
    const want = REFERENCE[anchor];
    for (const ramp of ROWS[anchor as Anchor].palettes) {
      const [l, a, b] = labOf(ramp[1]);
      expect(inside(l, want?.l ?? [0, 0]), `L ${String(l)}`).toBe(true);
      if (want?.a !== undefined) expect(inside(a, want.a), `a ${String(a)}`).toBe(true);
      if (want?.b !== undefined) expect(inside(b, want.b), `b ${String(b)}`).toBe(true);
      if (want?.chroma !== undefined) expect(inside(Math.hypot(a, b), want.chroma), "chroma").toBe(true);
    }
  });

  it("gives Iapetus's two faces: one coal-dark, the other bright", () => {
    for (const [low, , high] of ROWS["two-faced"].palettes) {
      expect(labOf(low)[0]).toBeLessThan(5);
      expect(labOf(high)[0]).toBeGreaterThan(88);
    }
  });

  it("runs every ramp from dark to light, so no relief reads as its negative", () => {
    for (const anchor of ANCHORS)
      for (const [low, mid, high] of ROWS[anchor].palettes) {
        expect(labOf(mid)[0], anchor).toBeGreaterThan(labOf(low)[0]);
        expect(labOf(high)[0], anchor).toBeGreaterThan(labOf(mid)[0]);
      }
  });

  // A glow on a banded world hides its night's lights (2e76ee19): no row may have both.
  it("gives no banded world a glow", () => {
    for (const anchor of ANCHORS)
      expect(ROWS[anchor].banded === true && ROWS[anchor].glow !== undefined, anchor).toBe(false);
  });

  // A floor under which two anchors of one kind could pass for each other by colour; temperate and ocean, apart by their seas, sit at 6.6.
  it("keeps any two anchors of one kind 6 apart in Lab, their palettes' centres", () => {
    const centre = (anchor: Anchor) => {
      const [one, other] = ROWS[anchor].palettes.map((ramp) => labOf(ramp[1]));
      return [0, 1, 2].map((at) => ((one?.[at] ?? 0) + (other?.[at] ?? 0)) / 2);
    };
    for (const [at, anchor] of ANCHORS.entries())
      for (const other of ANCHORS.slice(at + 1)) {
        if (BANDED.includes(anchor) !== BANDED.includes(other)) continue;
        const [l, a, b] = centre(anchor);
        const [ol, oa, ob] = centre(other);
        expect(
          Math.hypot((l ?? 0) - (ol ?? 0), (a ?? 0) - (oa ?? 0), (b ?? 0) - (ob ?? 0)),
          `${anchor} and ${other}`,
        ).toBeGreaterThanOrEqual(6);
      }
  });
});

describe("planetLook", () => {
  it("gives one path one look, however often it is asked", () => {
    fc.assert(
      fc.property(anyPath, anyAnchor, (path, anchor) => {
        expect(planetLook(path, anchor)).toEqual(planetLook(Uint8Array.from(path), anchor));
      }),
    );
  });

  it("gives two paths two looks", () => {
    fc.assert(
      fc.property(anyPath, anyPath, anyAnchor, (one, other, anchor) => {
        fc.pre(hex(one) !== hex(other));
        expect(planetLook(one, anchor)).not.toEqual(planetLook(other, anchor));
      }),
    );
  });

  // The plan's bound on near-identical neighbours (section 6): realms named one after the other are not one world twice.
  it("keeps neighbours apart: a path a digit away moves at least four of the six angles and offsets by 1%", () => {
    const shares = (look: PlanetLook) => [
      ...look.spin.map((turn) => turn / TURN),
      ...look.warp.offset.map((at) => at / 16),
    ];
    const all = paths(1000).map((path) => shares(planetLook(path, "rocky")));
    for (const [index, one] of all.slice(1).entries()) {
      const other = all[index] ?? [];
      const moved = one.filter((share, at) => Math.abs(share - (other[at] ?? share)) > 0.01);
      expect(moved.length, `world${String(index)}`).toBeGreaterThanOrEqual(4);
    }
  });

  it("gives long twins two worlds, not one: every word of a seed reaches the look", () => {
    const path = new Uint8Array(200).fill(0x61);
    const twin = Uint8Array.from(path);
    twin[199] = 0x62;
    const [one, other] = [planetLook(path, "rocky"), planetLook(twin, "rocky")];
    expect(other.spin[0]).not.toBeCloseTo(one.spin[0], 2);
    expect(other.warp.offset[0]).not.toBeCloseTo(one.warp.offset[0], 2);
    expect(other.tilt).not.toBeCloseTo(one.tilt, 2);
  });

  it("feeds the seed's words into the look, in order", () => {
    const seed = planetSeed(DAO);
    const word = (index: number) =>
      ((seed[index * 2] ?? Number.NaN) * 256 + (seed[index * 2 + 1] ?? Number.NaN)) / 65535;
    const look = planetLook(DAO, "rocky");
    for (const [index, turn] of look.spin.entries()) expect(turn).toBeCloseTo(word(index) * TURN, 10);
    for (const [index, offset] of look.warp.offset.entries()) expect(offset).toBeCloseTo(word(index + 3) * 16, 10);
  });

  it.each([...ANCHORS])("spreads %s's looks: the seed reaches every layer", (anchor) => {
    const looks = paths(200).map((path) => planetLook(path, anchor));
    expect(new Set(looks.map((look) => JSON.stringify(look.ramp))).size).toBeGreaterThan(150);
    expect(spread(looks.map((look) => look.warp.amount))).toBeGreaterThan(0.04);
    expect(spread(looks.map((look) => look.warp.frequency))).toBeGreaterThan(0.5);
    expect(spread(looks.map((look) => look.tilt))).toBeGreaterThan(0.4);
    if (!BANDED.includes(anchor)) expect(spread(looks.map((look) => look.relief))).toBeGreaterThan(0);
    if (READS[anchor].maps.length > 1) expect(new Set(looks.map((look) => look.map)).size).toBe(2);
    if (READS[anchor].air && !BANDED.includes(anchor))
      expect(spread(looks.map((look) => look.rim?.thickness ?? 0))).toBeGreaterThan(0);
  });

  it("warps at low frequency alone: a higher one smears the map", () => {
    expect(MAX_WARP_FREQUENCY).toBeLessThanOrEqual(3);
    fc.assert(
      fc.property(anyPath, anyAnchor, (path, anchor) => {
        const { amount, frequency } = planetLook(path, anchor).warp;
        expect(frequency).toBeGreaterThan(0);
        expect(frequency).toBeLessThanOrEqual(MAX_WARP_FREQUENCY);
        expect(amount).toBeGreaterThanOrEqual(0);
        expect(amount).toBeLessThanOrEqual(0.3);
      }),
    );
  });

  it("turns a banded world about its pole alone, so its bands stay level", () => {
    fc.assert(
      fc.property(anyPath, fc.constantFrom(...BANDED), (path, anchor) => {
        const { spin } = planetLook(path, anchor);
        expect(spin[1]).toBe(0);
        expect(spin[2]).toBe(0);
      }),
    );
  });

  it("leans a world's axis as real planets lean, never upside down", () => {
    fc.assert(
      fc.property(anyPath, anyAnchor, (path, anchor) => {
        expect(Math.abs(planetLook(path, anchor).tilt)).toBeLessThanOrEqual(0.6);
      }),
    );
  });

  it("opens a ringed world's rings towards the eye: edge on, they read as the status ring's thin line", () => {
    for (const anchor of ANCHORS)
      for (const path of paths(400)) {
        const { rings, lean } = planetLook(path, anchor);
        expect(Math.abs(lean)).toBeLessThanOrEqual(0.7);
        if (rings !== null) expect(Math.abs(lean)).toBeGreaterThanOrEqual(0.3);
      }
  });

  it("leans worlds both ways", () => {
    const leans = paths(100).map((path) => planetLook(path, "gas giant").lean);
    expect(leans.some((lean) => lean > 0)).toBe(true);
    expect(leans.some((lean) => lean < 0)).toBe(true);
  });

  it("keeps every colour in range and plausible, never neon", () => {
    fc.assert(
      fc.property(anyPath, anyAnchor, (path, anchor) => {
        for (const colour of colours(planetLook(path, anchor))) {
          for (const channel of colour) {
            expect(channel).toBeGreaterThanOrEqual(0);
            expect(channel).toBeLessThanOrEqual(1);
          }
          expect(Math.max(...colour) - Math.min(...colour)).toBeLessThanOrEqual(0.72);
        }
      }),
    );
  });

  it("keeps every air as thin and as dim as the Earth's, each in its own colour", () => {
    for (const anchor of ANCHORS)
      for (const path of paths(100)) {
        const { rim } = planetLook(path, anchor);
        if (rim === null) continue;
        expect(rim.thickness, anchor).toBeLessThanOrEqual(0.05);
        expect(Math.max(...rim.colour), anchor).toBeLessThanOrEqual(0.55);
      }
  });

  it("gives a temperate world and an ocean world the frames' seas, a shallow blue over a deep one", () => {
    const byte = ([red, green, blue]: readonly number[]) =>
      (red ?? 0) * 255 * 65536 + (green ?? 0) * 255 * 256 + (blue ?? 0) * 255;
    const seaOf = (anchor: Anchor) => planetLook(DAO, anchor).sea;
    expect(byte(seaOf("temperate")?.shallow ?? [])).toBeCloseTo(0x1f4a80, 6);
    expect(byte(seaOf("temperate")?.deep ?? [])).toBeCloseTo(0x0b2250, 6);
    expect(byte(seaOf("ocean")?.shallow ?? [])).toBeCloseTo(0x1b5c8f, 6);
    expect(byte(seaOf("ocean")?.deep ?? [])).toBeCloseTo(0x0a2a5c, 6);
  });

  it("draws rings wide on any world, so they never read as the status ring", () => {
    for (const anchor of ANCHORS)
      for (const path of paths(400)) {
        const { rings } = planetLook(path, anchor);
        if (rings === null) continue;
        expect(rings.inner).toBeGreaterThanOrEqual(1.2);
        expect(rings.outer - rings.inner).toBeGreaterThanOrEqual(0.6);
        expect(rings.opacity).toBeGreaterThan(0);
        expect(rings.opacity).toBeLessThanOrEqual(1);
      }
  });

  it("gives rings to many giants and to few others", () => {
    expect(ringShare("gas giant")).toBeGreaterThan(0.3);
    expect(ringShare("ice giant")).toBeGreaterThan(0.3);
    expect(ringShare("rocky")).toBeLessThan(0.1);
    expect(ringShare("rocky")).toBeGreaterThan(0);
  });

  it("gives clouds and seas only to a world with air", () => {
    fc.assert(
      fc.property(anyPath, anyAnchor, (path, anchor) => {
        const look = planetLook(path, anchor);
        if (planetRecipe(path, anchor).surface.clouds > 0 || look.sea !== null) expect(look.rim).not.toBeNull();
      }),
    );
  });

  it("leaves no value unset, for the empty path and a long one", () => {
    for (const path of [new Uint8Array(0), new Uint8Array(2000).fill(0x61)])
      for (const anchor of ANCHORS) {
        const numbers = JSON.stringify(planetLook(path, anchor), (_, value: unknown) =>
          typeof value === "number" && !Number.isFinite(value) ? "unset" : value,
        );
        expect(numbers).not.toContain("unset");
      }
  });
});

// What 7b5 draws (ADR-0002 §3): the recipe carries the surface, so the look keeps only what is still drawn from it, every byte of the
// seed still feeds a value before anything hashes it again (F3476), and no generated world shows the Earth's map (F4223).
describe("a look, as 7b5 draws it", () => {
  const RETIRED = ["second", "secondShare", "contrast", "caps", "clouds", "rifts", "cracks"];
  const flipped = (seed: Uint8Array, at: number): Uint8Array =>
    seed.map((byte, index) => (index === at ? byte ^ 0x80 : byte));

  it("holds nothing the recipe now draws in its place", () => {
    for (const anchor of ANCHORS)
      for (const name of RETIRED) expect(planetLook(DAO, anchor), `${anchor} ${name}`).not.toHaveProperty(name);
  });

  it("places the minor class's regions by an offset of their own, from three bytes no other value reads", () => {
    const seed = planetSeed(DAO);
    const look = seededLook(seed, "rocky");
    expect(look.minorOffset).toEqual([18, 20, 22].map((at) => ((seed[at] ?? 0) / 255) * 16));
  });

  // Each byte, the values of the look it moves, as look.ts states them (byte 15 is the recipe's minor share, apart).
  const READ_BY: Record<number, readonly string[]> = {
    0: ["spin"],
    1: ["spin"],
    2: ["spin"],
    3: ["spin"],
    4: ["spin"],
    5: ["spin"],
    6: ["warp"],
    7: ["warp"],
    8: ["warp"],
    9: ["warp"],
    10: ["warp"],
    11: ["warp"],
    12: ["ramp", "rings"],
    13: ["ramp", "rings", "lean"],
    14: ["warp"],
    15: [],
    16: ["tilt"],
    17: ["relief"],
    18: ["minorOffset"],
    19: ["recolour"],
    20: ["minorOffset"],
    21: ["rim"],
    22: ["minorOffset"],
    23: ["map"],
    24: ["rings", "lean"],
    25: ["rings"],
    26: ["rings"],
    27: ["rings"],
    28: ["rings"],
    29: ["glow"],
    30: ["warp"],
    31: ["rim"],
  };
  const movedBy = (seed: Uint8Array, at: number): Set<string> => {
    const moved = new Set<string>();
    for (const anchor of ANCHORS) {
      const [before, after] = [seededLook(seed, anchor), seededLook(flipped(seed, at), anchor)];
      for (const key of Object.keys(before) as (keyof PlanetLook)[])
        if (JSON.stringify(before[key]) !== JSON.stringify(after[key])) moved.add(key);
    }
    return moved;
  };

  // A ring's bytes move a look only where it has rings, so the seeds are many enough for some to.
  it("takes all 32 bytes of the seed before hashing again, each into the values it is stated to feed (F3476)", () => {
    const seeds = paths(16).map((path) => planetSeed(path));
    for (let at = 0; at < 32; at += 1) {
      const moved = new Set<string>();
      for (const seed of seeds) for (const key of movedBy(seed, at)) moved.add(key);
      for (const key of moved) expect(READ_BY[at] ?? [], `byte ${String(at)} moves ${key}`).toContain(key);
      if (at !== 15) expect(moved.size, `byte ${String(at)} feeds nothing`).toBeGreaterThan(0);
    }
    for (const seed of seeds) {
      expect(seededRecipe(flipped(seed, 15), "rocky", NO_TURN).minorShare).not.toBe(
        seededRecipe(seed, "rocky", NO_TURN).minorShare,
      );
      for (const at of [18, 20, 22]) expect([...movedBy(seed, at)], `byte ${String(at)}`).toEqual(["minorOffset"]);
    }
  });

  it("draws the Earth's map on no world but the Earth: its coasts would show through any warp (F4223)", () => {
    for (const anchor of ANCHORS) {
      expect(ROWS[anchor].maps, anchor).not.toContain("earth-day");
      for (const path of paths(40)) {
        expect(planetLook(path, anchor).map, anchor).not.toBe("earth-day");
        expect(planetRecipe(path, anchor).minorMap, anchor).not.toBe("earth-day");
      }
    }
  });
});

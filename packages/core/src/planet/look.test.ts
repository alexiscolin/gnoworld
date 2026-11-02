import fc from "fast-check";
import { describe, expect, it } from "vitest";
import {
  ANCHORS,
  MAPS,
  MAX_WARP_FREQUENCY,
  planetLook,
  planetSeed,
  type Anchor,
  type MapName,
  type PlanetLook,
} from "./look.ts";

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
  temperate: { sea: true, glow: false, air: true, maps: ["earth-day"] },
  desert: { sea: false, glow: false, air: true, maps: ["mars", "ceres"] },
  ocean: { sea: true, glow: false, air: true, maps: ["earth-day"] },
  ice: { sea: false, glow: false, air: false, maps: ["eris"] },
  volcanic: { sea: false, glow: true, air: true, maps: ["venus"] },
  "gas giant": { sea: false, glow: false, air: true, maps: ["jupiter"] },
  "ice giant": { sea: false, glow: false, air: true, maps: ["neptune"] },
  "cloud deck": { sea: false, glow: false, air: true, maps: ["haze"] },
  "tidally locked": { sea: false, glow: false, air: true, maps: ["mars", "ceres"] },
  "dark carbon": { sea: false, glow: false, air: false, maps: ["ceres"] },
  shattered: { sea: false, glow: true, air: false, maps: ["moon"] },
};

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

describe("the twelve anchors", () => {
  it("are ADR-0002 §3's, in its order", () => {
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
      expect(MAPS).toContain(look.second);
    }
  });

  it("locks one world alone, rifts one alone and cracks one alone", () => {
    for (const anchor of ANCHORS) {
      const look = planetLook(DAO, anchor);
      expect(look.locked).toBe(anchor === "tidally locked");
      expect(look.rifts > 0).toBe(anchor === "shattered");
      expect(look.cracks > 0).toBe(anchor === "ice");
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
    expect(spread(looks.map((look) => look.secondShare))).toBeGreaterThan(0.15);
    expect(spread(looks.map((look) => look.tilt))).toBeGreaterThan(0.4);
    expect(spread(looks.map((look) => look.relief))).toBeGreaterThan(0);
    if (READS[anchor].maps.length > 1) expect(new Set(looks.map((look) => look.map)).size).toBe(2);
    if (READS[anchor].air && !["ice giant", "gas giant", "cloud deck"].includes(anchor))
      expect(spread(looks.map((look) => look.rim?.thickness ?? 0))).toBeGreaterThan(0);
    if (READS[anchor].sea) {
      expect(spread(looks.map((look) => look.sea?.level ?? 0))).toBeGreaterThan(0.05);
      expect(spread(looks.map((look) => look.clouds))).toBeGreaterThan(0.1);
    }
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

  it("keeps the dominant map at 60% or more", () => {
    fc.assert(
      fc.property(anyPath, anyAnchor, (path, anchor) => {
        const { secondShare } = planetLook(path, anchor);
        expect(secondShare).toBeGreaterThanOrEqual(0);
        expect(secondShare).toBeLessThanOrEqual(0.4);
      }),
    );
  });

  it("turns a banded world about its pole alone, so its bands stay level", () => {
    fc.assert(
      fc.property(anyPath, fc.constantFrom<Anchor>("gas giant", "ice giant", "cloud deck"), (path, anchor) => {
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

  it("lifts the faint bands of a banded world's map", () => {
    for (const path of paths(50)) {
      expect(planetLook(path, "rocky").contrast).toBeGreaterThanOrEqual(1);
      expect(planetLook(path, "ice giant").contrast).toBeGreaterThan(planetLook(path, "gas giant").contrast);
      expect(planetLook(path, "cloud deck").contrast).toBeGreaterThan(planetLook(path, "rocky").contrast);
    }
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
        if (look.clouds > 0 || look.sea !== null) expect(look.rim).not.toBeNull();
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

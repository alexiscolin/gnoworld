import fc from "fast-check";
import { describe, expect, it } from "vitest";
import { anchorOf, ANCHORS, asciiBytes, planetSeed, type Anchor } from "./look.ts";
import { sha256 } from "./sha256.ts";
import {
  daysSince,
  isFresh,
  LIGHT_KINDS,
  STAGES,
  stageOf,
  worldSigns,
  type LightKind,
  type Stage,
  type WorldState,
} from "./signs.ts";

// A world's stages and the signs that show them (slice 7, 7b2; ADR-0002 §10): a stage reads the same on every class, each in its
// own form, and a sign keeps what it means, where it shows and how it grows. A world at rest with nobody here carries no sign at all: it
// is the render Alexis approved, drawn as the lab draws it.
const seedOf = (path: string) => planetSeed(asciiBytes(path));
const DAO = seedOf("gno.land/r/gov/dao");
const AT_REST: WorldState = { vitality: 0.1, present: 0, fresh: false };
const unit = fc.double({ min: 0, max: 1, noNaN: true });
const wild = fc.oneof(fc.double(), fc.constantFrom(Number.NaN, Infinity, -Infinity, -1, 2));
const anyState = fc.record({ vitality: unit, present: unit, fresh: fc.boolean() });
const anyAnchor = fc.constantFrom(...ANCHORS);
const anySeed = fc.uint8Array({ minLength: 32, maxLength: 32 });

// One state at each stage, the people there as a stage's usual crowd.
const AT: Record<Stage, WorldState> = {
  seed: { vitality: 0.1, present: 0.3, fresh: true },
  rest: AT_REST,
  living: { vitality: 0.42, present: 0.2, fresh: false },
  inhabited: { vitality: 0.62, present: 0.4, fresh: false },
  busy: { vitality: 0.8, present: 0.65, fresh: false },
  beacon: { vitality: 0.95, present: 0.9, fresh: false },
};

type Span = readonly [number, number];
// Each class's own way, stated apart from the rows: its kind, how wide its regions are, and how fine its form is.
const WAY: Record<Anchor, { kind: LightKind; grain: Span; fine: Span }> = {
  rocky: { kind: "towns", grain: [1.2, 2.2], fine: [0.7, 1.1] },
  temperate: { kind: "coasts", grain: [1.2, 2], fine: [0.85, 1] },
  desert: { kind: "towns", grain: [0.9, 1.6], fine: [0.45, 0.8] },
  ocean: { kind: "coasts", grain: [1.4, 2.4], fine: [1, 1.2] },
  ice: { kind: "cracks", grain: [1.2, 2], fine: [0.8, 1.2] },
  volcanic: { kind: "seams", grain: [1.4, 2.4], fine: [4, 5.6] },
  "gas giant": { kind: "belts", grain: [1, 1.8], fine: [24, 40] },
  "ice giant": { kind: "belts", grain: [1, 1.6], fine: [34, 52] },
  "cloud deck": { kind: "pools", grain: [1.4, 2.4], fine: [4, 5] },
  "tidally locked": { kind: "dusk", grain: [1.6, 2.6], fine: [0.2, 0.34] },
  "dark carbon": { kind: "seams", grain: [1, 1.8], fine: [5.5, 7.5] },
  shattered: { kind: "towns", grain: [1.2, 2], fine: [0.4, 0.7] },
  "nitrogen ice": { kind: "towns", grain: [1.3, 2.1], fine: [0.6, 0.95] },
  "grooved ice": { kind: "towns", grain: [1.1, 1.9], fine: [0.55, 0.9] },
  snowball: { kind: "towns", grain: [1.5, 2.3], fine: [0.65, 1] },
  hycean: { kind: "pools", grain: [1.2, 2.2], fine: [3.6, 4.6] },
  archean: { kind: "coasts", grain: [1.3, 2.1], fine: [0.8, 0.95] },
  "lava world": { kind: "seams", grain: [1.5, 2.5], fine: [4.4, 6] },
  "two-faced": { kind: "towns", grain: [1.2, 2], fine: [0.5, 0.9] },
  "water cloud giant": { kind: "belts", grain: [1.1, 1.9], fine: [20, 36] },
  "azure giant": { kind: "belts", grain: [1, 1.6], fine: [30, 48] },
  "dark giant": { kind: "belts", grain: [1.1, 1.7], fine: [28, 44] },
  "hot giant": { kind: "belts", grain: [1.4, 2.4], fine: [16, 26] },
  "sub-Neptune": { kind: "pools", grain: [1.6, 2.6], fine: [4.4, 5.4] },
};
const SEA: readonly Anchor[] = ["temperate", "ocean", "archean"];
const between = ([from, to]: Span, share: number) => from + (to - from) * share;
const TURN = Math.PI * 2;
// A world's form reads the second hash past the bytes its class takes (0 to 2): 3 the grain, 4 the fineness, 5 to 7 the offset, 8 the turn.
const FIRST_FORM_BYTE = 3;
const OFFSET = 16;
const byteOf = (bytes: Uint8Array, index: number): number => {
  const byte = bytes[index];
  if (byte === undefined) throw new Error("no such byte");
  return byte;
};
const seedsOf = (anchor: Anchor, count: number): Uint8Array[] => {
  const found: Uint8Array[] = [];
  for (let at = 0; found.length < count; at += 1) {
    if (at > 50_000) throw new Error(`no ${anchor} in 50,000 paths`);
    const seed = seedOf(`gno.land/r/n${String(at)}/home`);
    if (anchorOf(seed) === anchor) found.push(seed);
  }
  return found;
};
const spread = (values: readonly number[]) => Math.max(...values) - Math.min(...values);

describe("the stages", () => {
  it("run from seed through rest, living, inhabited and busy to beacon (ADR-0002 §10)", () => {
    expect(STAGES).toEqual(["seed", "rest", "living", "inhabited", "busy", "beacon"]);
  });

  it.each([
    [0, "rest"],
    [0.2999, "rest"],
    [0.3, "living"],
    [0.4999, "living"],
    [0.5, "inhabited"],
    [0.6999, "inhabited"],
    [0.7, "busy"],
    [0.8799, "busy"],
    [0.88, "beacon"],
    [1, "beacon"],
  ] as const)("reads a vitality of %f as %s", (vitality, stage) => {
    expect(stageOf({ vitality, present: 0, fresh: false })).toBe(stage);
  });

  it("follows what the vitality remembers: a crowd today moves no stage, for a world turns little by little", () => {
    expect(stageOf({ vitality: 0.1, present: 1, fresh: false })).toBe("rest");
    expect(stageOf({ vitality: 0.8, present: 0, fresh: false })).toBe("busy");
  });

  it("keeps a new family a seed, whatever its gauges", () => {
    fc.assert(
      fc.property(unit, unit, (vitality, present) => {
        expect(stageOf({ vitality, present, fresh: true })).toBe("seed");
      }),
    );
  });

  it("reads what is no number as nothing, and what is past the top as the top", () => {
    expect(stageOf({ vitality: Number.NaN, present: 0, fresh: false })).toBe("rest");
    expect(stageOf({ vitality: Infinity, present: 0, fresh: false })).toBe("beacon");
    expect(stageOf({ vitality: -1, present: 0, fresh: false })).toBe("rest");
  });

  it("never lands on a stage from a value that is no share", () => {
    fc.assert(
      fc.property(wild, wild, (vitality, present) => {
        expect(STAGES).toContain(stageOf({ vitality, present, fresh: false }));
      }),
    );
  });
});

describe("isFresh", () => {
  it("holds until the first visit or 7 days, whichever comes first", () => {
    expect(isFresh(0, false)).toBe(true);
    expect(isFresh(6.99, false)).toBe(true);
    expect(isFresh(7, false)).toBe(false);
    expect(isFresh(1, true)).toBe(false);
  });

  it("does not take a world of unknown age for a new one: a first pass has no time to read", () => {
    expect(isFresh(null, false)).toBe(false);
    expect(isFresh(Number.NaN, false)).toBe(false);
    expect(isFresh(-1, false)).toBe(false);
    expect(isFresh(-0.1, false)).toBe(false);
  });
});

describe("daysSince", () => {
  const NOW = Date.parse("2026-11-03T12:00:00.000Z");

  it("counts the days since the file first saw a world, in parts of a day", () => {
    expect(daysSince("2026-11-01T00:00:00.000Z", NOW)).toBeCloseTo(2.5, 9);
    expect(daysSince("2026-11-03T12:00:00.000Z", NOW)).toBe(0);
  });

  it("says nothing of a world the file never saw, of a time it cannot read, nor of a time to come", () => {
    expect(daysSince(null, NOW)).toBeNull();
    expect(daysSince(undefined, NOW)).toBeNull();
    expect(daysSince("not a time", NOW)).toBeNull();
    expect(daysSince("2026-11-03T12:00:00.001Z", NOW)).toBeNull();
  });
});

describe("a world at rest", () => {
  it("carries no sign and keeps its size: it is the lab's render", () => {
    for (const anchor of ANCHORS) {
      const { stage, size, lights, signal } = worldSigns(DAO, anchor, AT_REST);
      expect(stage).toBe("rest");
      expect(size).toBe(1);
      expect(lights.extent).toBe(0);
      expect(signal).toBe(0);
    }
  });

  it("stays so all the way up its stage, while nobody is here", () => {
    fc.assert(
      fc.property(fc.double({ min: 0, max: 0.2999, noNaN: true }), anyAnchor, (vitality, anchor) => {
        const signs = worldSigns(DAO, anchor, { vitality, present: 0, fresh: false });
        expect(signs.size).toBe(1);
        expect(signs.lights.extent).toBe(0);
      }),
    );
  });

  it("wakes while people are here: a few lights, and no stage or size moved", () => {
    const awake = worldSigns(DAO, "rocky", { vitality: 0.1, present: 0.5, fresh: false });
    expect(awake.stage).toBe("rest");
    expect(awake.size).toBe(1);
    expect(awake.lights.extent).toBeGreaterThan(0);
    const beacon = worldSigns(DAO, "rocky", { vitality: 0.95, present: 0.5, fresh: false });
    expect(awake.lights).toEqual(beacon.lights);
  });

  // F4110 (Alexis, 2026-11-02): night lights mean people here now and nothing else; a stage shows through its size.
  it("lights a night side with the people here alone: a vitality moves neither how far nor how bright", () => {
    fc.assert(
      fc.property(fc.tuple(unit, unit, unit, anyAnchor), ([vitality, other, present, anchor]) => {
        const one = worldSigns(DAO, anchor, { vitality, present, fresh: false }).lights;
        const two = worldSigns(DAO, anchor, { vitality: other, present, fresh: false }).lights;
        expect(two.extent).toBe(one.extent);
        expect(two.level).toBe(one.level);
      }),
    );
  });

  it("shows no light on a settled world with nobody here, at any stage", () => {
    fc.assert(
      fc.property(unit, anyAnchor, (vitality, anchor) => {
        expect(worldSigns(DAO, anchor, { vitality, present: 0, fresh: false }).lights.extent).toBe(0);
      }),
    );
    for (const stage of ["living", "inhabited", "busy", "beacon"] as const)
      expect(worldSigns(DAO, "rocky", { ...AT[stage], present: 0 }).lights.extent, stage).toBe(0);
  });

  it("spreads its lights as far as the people here reach: more people, more of the night side", () => {
    const extent = (present: number) => worldSigns(DAO, "ice", { ...AT.living, present }).lights.extent;
    expect(extent(0.05)).toBeCloseTo(0.05, 12);
    expect(extent(0.3)).toBeCloseTo(0.3, 12);
    expect(extent(0.9)).toBeCloseTo(0.9, 12);
    expect(extent(1)).toBe(1);
  });
});

describe("a stage reads the same on every class", () => {
  it.each([...STAGES])("%s: one size, one share of lights, one level, one signal", (stage) => {
    const readings = ANCHORS.map((anchor) => {
      const { stage: read, size, signal, lights } = worldSigns(DAO, anchor, AT[stage]);
      return { read, size, signal, extent: lights.extent, level: lights.level };
    });
    expect(readings[0]?.read).toBe(stage);
    for (const reading of readings) expect(reading).toEqual(readings[0]);
  });

  it("and each class shows it its own way, no two in the same form", () => {
    const forms = ANCHORS.map((anchor) => JSON.stringify(WAY[anchor]));
    expect(new Set(forms).size).toBe(ANCHORS.length);
    expect(Object.keys(WAY).sort()).toEqual([...ANCHORS].sort());
    for (const anchor of ANCHORS)
      for (const path of ["a", "b", "c"])
        expect(worldSigns(seedOf(path), anchor, AT.busy).lights.kind, anchor).toBe(WAY[anchor].kind);
    expect(new Set(Object.values(WAY).map(({ kind }) => kind))).toEqual(new Set(LIGHT_KINDS));
  });

  // Its lights are the people's (F4110), held by their own tests: AT's crowds grow with the stages and would hold them for nothing here.
  it("grows stage by stage on every class: matter, never a step back", () => {
    for (const anchor of ANCHORS) {
      const climb = (["rest", "living", "inhabited", "busy", "beacon"] as const).map((stage) =>
        worldSigns(DAO, anchor, { ...AT[stage], present: 0.5 }),
      );
      for (const [index, signs] of climb.slice(1).entries())
        expect(signs.size, anchor).toBeGreaterThan(climb[index]?.size ?? 9);
      expect(climb.at(-1)?.size, "a beacon stands out as matter").toBeGreaterThan(1.4);
    }
  });
});

describe("a world's form", () => {
  it.each([...ANCHORS])("reads %s's row at the second hash's own bytes, none of the class's", (anchor) => {
    const { grain, fine } = WAY[anchor];
    for (const seed of seedsOf(anchor, 20)) {
      const more = sha256(seed);
      const { lights } = worldSigns(seed, anchor, AT.busy);
      expect(lights.grain).toBeCloseTo(between(grain, byteOf(more, FIRST_FORM_BYTE) / 255), 10);
      expect(lights.fine).toBeCloseTo(between(fine, byteOf(more, FIRST_FORM_BYTE + 1) / 255), 10);
      expect(lights.offset).toEqual([5, 6, 7].map((at) => (byteOf(more, at) / 255) * OFFSET));
      expect(lights.turn).toBe(SEA.includes(anchor) ? 0 : (byteOf(more, 8) / 255) * TURN);
    }
  });

  // The second hash of gov/dao's seed, from Python's hashlib: 8bebf3 d15354d73ab28a ...
  it("keeps gov/dao's form, as a golden apart from the code", () => {
    const { grain, fine, offset, turn } = worldSigns(DAO, "volcanic", AT.busy).lights;
    expect(grain).toBeCloseTo(1.4 + (209 / 255) * 1, 10);
    expect(fine).toBeCloseTo(4 + (83 / 255) * 1.6, 10);
    expect(offset[0]).toBeCloseTo((84 / 255) * 16, 10);
    expect(offset[1]).toBeCloseTo((215 / 255) * 16, 10);
    expect(offset[2]).toBeCloseTo((58 / 255) * 16, 10);
    expect(turn).toBeCloseTo((178 / 255) * TURN, 10);
  });

  it.each([...ANCHORS])("spreads over the worlds of %s, each axis on its own", (anchor) => {
    const forms = seedsOf(anchor, 120).map((seed) => worldSigns(seed, anchor, AT.busy).lights);
    const reach = (values: readonly number[], [from, to]: Span) => spread(values) / (to - from);
    expect(
      reach(
        forms.map(({ grain }) => grain),
        WAY[anchor].grain,
      ),
    ).toBeGreaterThan(0.8);
    expect(
      reach(
        forms.map(({ fine }) => fine),
        WAY[anchor].fine,
      ),
    ).toBeGreaterThan(0.8);
    for (const axis of [0, 1, 2])
      expect(spread(forms.map(({ offset }) => offset[axis] ?? 0))).toBeGreaterThan(OFFSET * 0.8);
    if (!SEA.includes(anchor)) expect(spread(forms.map(({ turn }) => turn))).toBeGreaterThan(TURN * 0.8);
  });
});

describe("a sign keeps its meaning and varies its form", () => {
  it("shows the same for two worlds of a class, in two patterns of their own", () => {
    const [one, other] = [worldSigns(seedOf("a"), "rocky", AT.busy), worldSigns(seedOf("b"), "rocky", AT.busy)];
    expect(other.lights.extent).toBe(one.lights.extent);
    expect(other.lights.level).toBe(one.lights.level);
    expect(other.lights.kind).toBe(one.lights.kind);
    expect(other.lights.grain).not.toBe(one.lights.grain);
    expect(other.lights.fine).not.toBe(one.lights.fine);
    expect(other.lights.offset).not.toEqual(one.lights.offset);
    expect(other.lights.turn).not.toBe(one.lights.turn);
  });

  it("gives a world one form, whatever its gauges: its pattern stays while it grows", () => {
    fc.assert(
      fc.property(fc.tuple(anySeed, anyAnchor, anyState, anyState), ([seed, anchor, one, other]) => {
        const [first, second] = [worldSigns(seed, anchor, one).lights, worldSigns(seed, anchor, other).lights];
        expect([first.kind, first.grain, first.fine, first.offset, first.turn]).toEqual([
          second.kind,
          second.grain,
          second.fine,
          second.offset,
          second.turn,
        ]);
      }),
    );
  });

  it("keeps a sea world's lights on its land: its night map is read where its day map is", () => {
    for (const anchor of SEA)
      for (const path of ["a", "b", "c"]) expect(worldSigns(seedOf(path), anchor, AT.busy).lights.turn).toBe(0);
  });

  it("reads popularity as matter, never brightness: a vitality moves no level, people move no size", () => {
    fc.assert(
      fc.property(unit, unit, unit, (vitality, other, present) => {
        const [one, two] = [
          worldSigns(DAO, "ice", { vitality, present, fresh: false }),
          worldSigns(DAO, "ice", { vitality: other, present, fresh: false }),
        ];
        expect(two.lights.level).toBe(one.lights.level);
        const crowd = worldSigns(DAO, "ice", { vitality, present: 1, fresh: false });
        expect(crowd.size).toBe(worldSigns(DAO, "ice", { vitality, present: 0, fresh: false }).size);
      }),
    );
  });

  it("lights a world with the people here, on a ladder from a little to the most", () => {
    const level = (present: number) => worldSigns(DAO, "ice", { ...AT.busy, present }).lights.level;
    expect(level(0)).toBeGreaterThan(0.2);
    expect(level(0.05)).toBeGreaterThan(level(0));
    expect(level(0.3)).toBeGreaterThan(level(0.05));
    expect(level(0.9)).toBeGreaterThan(level(0.3));
    expect(level(1)).toBe(1);
  });

  it("never falls as a world grows or people arrive", () => {
    fc.assert(
      fc.property(fc.tuple(unit, unit, unit, unit), ([vitality, more, present, others]) => {
        const state = { vitality: vitality * 0.5, present: present * 0.5, fresh: false };
        const base = worldSigns(DAO, "ice", state);
        const grown = worldSigns(DAO, "ice", { ...state, vitality: state.vitality + more * 0.5 });
        const crowded = worldSigns(DAO, "ice", { ...state, present: state.present + others * 0.5 });
        expect(grown.size).toBeGreaterThanOrEqual(base.size);
        expect(grown.lights.extent).toBeGreaterThanOrEqual(base.lights.extent);
        expect(crowded.lights.extent).toBeGreaterThanOrEqual(base.lights.extent);
        expect(crowded.lights.level).toBeGreaterThanOrEqual(base.lights.level);
      }),
    );
  });

  it("turns little by little: a day's most moves the radius a few percent and the lights a few, across any stage's border", () => {
    fc.assert(
      fc.property(fc.double({ min: 0, max: 0.97, noNaN: true }), unit, (vitality, present) => {
        const today = worldSigns(DAO, "ice", { vitality, present, fresh: false });
        const tomorrow = worldSigns(DAO, "ice", { vitality: vitality + 0.03, present, fresh: false });
        expect(tomorrow.size / today.size).toBeLessThan(1.04);
        expect(tomorrow.lights.extent - today.lights.extent).toBeLessThan(0.07);
      }),
      {
        examples: [
          [0.27, 0],
          [0.47, 0.2],
          [0.67, 0.5],
          [0.85, 1],
        ],
      },
    );
  });

  it("stays bounded: the busiest never floods the view", () => {
    fc.assert(
      fc.property(anySeed, anyAnchor, anyState, (seed, anchor, state) => {
        const { size, signal, lights } = worldSigns(seed, anchor, state);
        expect(size).toBeGreaterThan(0.2);
        expect(size).toBeLessThanOrEqual(1.6);
        expect(signal).toBeGreaterThanOrEqual(0);
        expect(signal).toBeLessThanOrEqual(1);
        expect(lights.extent).toBeGreaterThanOrEqual(0);
        expect(lights.extent).toBeLessThanOrEqual(1);
        expect(lights.level).toBeGreaterThan(0);
        expect(lights.level).toBeLessThanOrEqual(1);
      }),
    );
  });

  it("gives a number to every value, whatever the gauges hold", () => {
    fc.assert(
      fc.property(fc.tuple(wild, wild, fc.boolean(), anyAnchor), ([vitality, present, fresh, anchor]) => {
        const { size, signal, lights } = worldSigns(DAO, anchor, { vitality, present, fresh });
        for (const value of [size, signal, lights.extent, lights.level]) expect(Number.isFinite(value)).toBe(true);
      }),
    );
  });
});

// The numbers docs/decisions.md gives, stated apart from the code: a change to one is a change to what a stage means.
describe("what the signs are worth", () => {
  const at = (vitality: number, present: number, fresh = false) => worldSigns(DAO, "ice", { vitality, present, fresh });

  // F4110: with nobody here, no vitality lights any of a world's surface.
  it.each([
    [0.3, 1, 0],
    [0.4, 1 + 0.6 / 7, 0],
    [0.65, 1.3, 0],
    [1, 1.6, 0],
  ])("a vitality of %f gives a radius of %f and lights over %f of its surface", (vitality, size, extent) => {
    const signs = at(vitality, 0);
    expect(signs.size).toBeCloseTo(size, 12);
    expect(signs.lights.extent).toBeCloseTo(extent, 12);
  });

  it("lights as much of a world's surface as the share of people here, at rest or settled", () => {
    expect(at(0.1, 1).lights.extent).toBe(1);
    expect(at(0.8, 1).lights.extent).toBe(1);
    expect(at(0.1, 0.5).lights.extent).toBeCloseTo(0.5, 12);
    expect(at(0.95, 0.05).lights.extent).toBeCloseTo(0.05, 12);
  });

  it("lights a world from 0.35 with nobody here to 1 at the most people", () => {
    expect(at(0.8, 0).lights.level).toBeCloseTo(0.35, 12);
    expect(at(0.8, 0.5).lights.level).toBeCloseTo(0.675, 12);
    expect(at(0.8, 1).lights.level).toBe(1);
  });

  it("gives a seed a quarter of a world's radius or so, by what it has become", () => {
    expect(at(0, 0, true).size).toBeCloseTo(0.22, 12);
    expect(at(0.1, 0, true).size).toBeCloseTo(0.28, 12);
    expect(at(0.2, 0, true).size).toBeCloseTo(0.34, 12);
    expect(at(1, 0, true).size).toBeCloseTo(0.34, 12);
  });

  it("gives a seed a signal from 0.45 up, by the more popular of its two gauges", () => {
    expect(at(0, 0, true).signal).toBeCloseTo(0.45, 12);
    expect(at(1, 0, true).signal).toBe(1);
    expect(at(0, 1, true).signal).toBe(1);
    expect(at(0.5, 0.2, true).signal).toBeCloseTo(0.725, 12);
    expect(at(0.2, 0.5, true).signal).toBeCloseTo(0.725, 12);
  });
});

describe("a seed", () => {
  it("is a small heart, far under a world at rest, and shows its signal", () => {
    const { size, signal } = worldSigns(DAO, "rocky", AT.seed);
    expect(size).toBeLessThan(0.35);
    expect(signal).toBeGreaterThan(0);
  });

  it("leaves a crowd out of its matter: people today move its glow, never its size", () => {
    const [quiet, crowded] = [0, 1].map((present) => worldSigns(DAO, "rocky", { vitality: 0.1, present, fresh: true }));
    expect(crowded?.size).toBe(quiet?.size);
    expect(crowded?.signal).toBeGreaterThan(quiet?.signal ?? 1);
  });

  // docs/decisions.md: a seed's end is an event, for the world wakes, on its first visit or at its seventh day (7e's wake): no ramp hides it.
  it("ends in one step, the wake's: the last day of a seed and the first of a world", () => {
    const seed = worldSigns(DAO, "rocky", { vitality: 0.2, present: 0, fresh: true });
    const woken = worldSigns(DAO, "rocky", { vitality: 0.2, present: 0, fresh: false });
    expect(woken.size / seed.size).toBeGreaterThan(2.9);
    expect(woken.signal).toBe(0);
  });

  it("shows how popular its start is: more matter and a stronger signal (Alexis, 2026-11-01)", () => {
    const quiet = worldSigns(DAO, "rocky", { vitality: 0, present: 0, fresh: true });
    const known = worldSigns(DAO, "rocky", { vitality: 0, present: 0.8, fresh: true });
    const grown = worldSigns(DAO, "rocky", { vitality: 0.8, present: 0, fresh: true });
    expect(known.signal).toBeGreaterThan(quiet.signal);
    expect(grown.size).toBeGreaterThan(quiet.size);
    expect(grown.signal).toBeGreaterThan(quiet.signal);
    expect(quiet.signal).toBeGreaterThan(0);
  });

  it("stays smaller than a world at rest at its most popular", () => {
    fc.assert(
      fc.property(unit, unit, (vitality, present) => {
        expect(worldSigns(DAO, "rocky", { vitality, present, fresh: true }).size).toBeLessThan(1);
      }),
    );
  });

  it("is the one stage with a signal", () => {
    fc.assert(
      fc.property(unit, unit, (vitality, present) => {
        expect(worldSigns(DAO, "ice", { vitality, present, fresh: false }).signal).toBe(0);
      }),
    );
  });
});

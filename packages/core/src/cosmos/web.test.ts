import fc from "fast-check";
import { describe, expect, it } from "vitest";
import { toScene } from "../frame/disc.ts";
import { MOOD_SCALE } from "../space/mood.ts";
import { systemsOf, type WorldHeld } from "./system.ts";
import { LINKS_MOST, linksOf, pointTint, softPoint, type LinkedWorld } from "./web.ts";

// The whole cosmos (ADR-0002 §10; Alexis, 2026-11-02): past a cluster's distance the worlds themselves are the nebula, a soft point for
// each real world and a thin line for each real import between two worlds. A line means a link the file holds, and nothing else.
const realm = (path: string, imports: readonly string[] = []) => ({ path: `gno.land/r/${path}`, imports });
const world = (id: string, ...realms: LinkedWorld["realms"][number][]): LinkedWorld => ({ id, realms });

// The links as id pairs, each pair's ids sorted, the pairs sorted: what a picture shows, whatever the list's order.
const pairsOf = (worlds: readonly LinkedWorld[], most?: number): string[] => {
  const links = linksOf(worlds, most);
  const pairs: string[] = [];
  for (let at = 0; at < links.length; at += 2) {
    const ids = [worlds[links[at] ?? -1]?.id ?? "?", worlds[links[at + 1] ?? -1]?.id ?? "?"].sort();
    pairs.push(ids.join(" "));
  }
  return pairs.sort();
};

// The scene's lens at the video's size: 50 degrees from top to bottom.
const WIDTH = 1728;
const HEIGHT = 1080;
const FOCAL = HEIGHT / 2 / Math.tan((25 * Math.PI) / 180);
const pointAt = (radius: number, distance: number, focus: number) => {
  const out = { size: 0, light: 0 };
  softPoint(radius, { distance, focus, focal: FOCAL }, out);
  return out;
};
// What a point adds to the frame: its light over its round.
const energy = ({ size, light }: { size: number; light: number }) => size * size * light;

describe("linksOf", () => {
  it("draws a line only where a realm of one world imports a realm of another", () => {
    const worlds = [
      world(
        "a/x",
        realm("a/x/one", [
          "gno.land/r/b/y/two",
          "gno.land/p/nt/avl/v0",
          "gno.land/r/a/x/three",
          "gno.land/r/nobody/here",
          "gno.land/r/b/y",
        ]),
        realm("a/x/three"),
      ),
      world("b/y", realm("b/y/two")),
      world("c/z", realm("c/z/four", ["gno.land/p/c/z/lib"])),
    ];
    expect(pairsOf(worlds)).toEqual(["a/x b/y"]);
  });

  it("draws a pair once, however many realms link it and whichever way", () => {
    const worlds = [
      world("a", realm("a/one", ["gno.land/r/b/two"]), realm("a/three", ["gno.land/r/b/two", "gno.land/r/b/four"])),
      world("b", realm("b/two", ["gno.land/r/a/one"]), realm("b/four")),
    ];
    expect(pairsOf(worlds)).toEqual(["a b"]);
  });

  it("draws none from a file that read no package, as the recorded one: no import, no line", () => {
    const worlds = [world("a", realm("a/one")), world("b", { path: "gno.land/r/b/two" }), world("c")];
    expect(linksOf(worlds)).toEqual([]);
    expect(linksOf([])).toEqual([]);
  });

  it("gives the same set the same lines, in any order", () => {
    const set = Array.from({ length: 40 }, (_, at) =>
      world(
        `w${String(at)}`,
        realm(`w${String(at)}/r`, [
          `gno.land/r/w${String((at * 7) % 40)}/r`,
          `gno.land/r/w${String((at * 3 + 1) % 40)}/r`,
        ]),
      ),
    );
    const expected = pairsOf(set);
    expect(expected.length).toBeGreaterThan(30);
    fc.assert(
      fc.property(fc.shuffledSubarray(set, { minLength: set.length, maxLength: set.length }), (shuffled) => {
        expect(pairsOf(shuffled)).toEqual(expected);
      }),
    );
  });

  it("keeps at most its bound, the same lines whatever the order, spread over the set rather than its first names", () => {
    const hub = world("hub", realm("hub/r"));
    const set = [
      hub,
      ...Array.from({ length: 300 }, (_, at) =>
        world(`w${String(at).padStart(3, "0")}`, realm(`w${String(at)}/r`, ["gno.land/r/hub/r"])),
      ),
    ];
    const kept = pairsOf(set, 50);
    expect(kept).toHaveLength(50);
    expect(pairsOf([...set].reverse(), 50)).toEqual(kept);
    // Not the alphabet's first fifty, nor its last: the cut is by a hash of the pair, so each third of the set keeps a share of the bound.
    for (const third of [/hub w0\d\d/, /hub w1\d\d/, /hub w2\d\d/]) {
      const inIt = kept.filter((pair) => third.test(pair)).length;
      expect(inIt).toBeGreaterThan(5);
      expect(inIt).toBeLessThan(30);
    }
    expect(linksOf(set).length / 2).toBe(300);
  });

  it("holds its own bound by itself, whatever a file names: every world linked to every other", () => {
    const set = Array.from({ length: 300 }, (_, at) =>
      world(
        `w${String(at)}`,
        realm(
          `w${String(at)}/r`,
          Array.from({ length: 300 }, (__, other) => `gno.land/r/w${String(other)}/r`),
        ),
      ),
    );
    expect(linksOf(set)).toHaveLength(2 * LINKS_MOST);
    expect(LINKS_MOST).toBeGreaterThanOrEqual(2 * 20_000);
    expect(LINKS_MOST).toBeLessThanOrEqual(65_536);
  });

  it("gives a realm two worlds name to the first of them by id, in any order", () => {
    const set = [world("b", realm("x/y")), world("a", realm("x/y")), world("c", realm("c/one", ["gno.land/r/x/y"]))];
    expect(pairsOf(set)).toEqual(["a c"]);
    expect(pairsOf([...set].reverse())).toEqual(["a c"]);
  });
});

describe("softPoint", () => {
  it("never keeps a size as the eye leaves: its light falls as the square of the distance, its size or its light at every step", () => {
    for (const radius of [0.2, 1.05, 1.7]) {
      let before = pointAt(radius, MOOD_SCALE / 4, MOOD_SCALE / 4);
      for (let distance = MOOD_SCALE / 4 + 5; distance < 100_000; distance *= 1.05) {
        // As a zoom does: the eye and what it looks at go out together.
        const after = pointAt(radius, distance, distance);
        expect(energy(after)).toBeLessThan(energy(before));
        expect(after.size).toBeLessThanOrEqual(before.size);
        expect(after.size < before.size || after.light < before.light).toBe(true);
        before = after;
      }
    }
    const near = pointAt(1.5, 400, 400);
    const far = pointAt(1.5, 800, 800);
    expect(energy(near) / energy(far)).toBeCloseTo(4, 9);
  });

  it("spreads a point nearer than the focus: larger and softer, the same light over a wider round", () => {
    for (const distance of [200, 400, 700]) {
      const sharp = pointAt(1.5, distance, distance);
      const near = pointAt(1.5, distance, distance * 1.6);
      expect(near.size).toBeGreaterThan(sharp.size * 1.05);
      expect(near.light).toBeLessThan(sharp.light);
      expect(energy(near)).toBeCloseTo(energy(sharp), 9);
    }
    // The nearer, the softer.
    expect(pointAt(1.5, 300, 900).size).toBeGreaterThan(pointAt(1.5, 600, 900).size);
  });

  it("keeps a point at or past the focus fine: what is far is small and sharp", () => {
    for (const distance of [400, 600, 1200])
      expect(pointAt(1.5, distance, 400)).toEqual(pointAt(1.5, distance, distance));
    expect(pointAt(1.5, 1200, 400).size).toBeLessThan(pointAt(1.5, 400, 400).size);
  });

  it("is finite, never negative and at most whole, for any radius, distance and lens, the eye on the world or nothing in focus", () => {
    for (const [distance, focus] of [
      [0, 340],
      [1e-300, 340],
      [400, 0],
      [400, -5],
      [0, 0],
    ] as const) {
      const { size, light } = pointAt(1.5, distance, focus);
      expect(Number.isFinite(size) && size > 0 && light >= 0 && light <= 1).toBe(true);
    }
    fc.assert(
      fc.property(
        fc.double({ min: 0.01, max: 4, noNaN: true }),
        fc.double({ min: 0, max: 1e9, noNaN: true }),
        fc.double({ min: -1e9, max: 1e9, noNaN: true }),
        (radius, distance, focus) => {
          const { size, light } = pointAt(radius, distance, focus);
          expect(Number.isFinite(size) && Number.isFinite(light)).toBe(true);
          expect(size).toBeGreaterThan(0);
          expect(light).toBeGreaterThanOrEqual(0);
          expect(light).toBeLessThanOrEqual(1);
        },
      ),
    );
  });
});

describe("a frame's cost", () => {
  // Every point's round on screen, in whole screens, from eyes over the disc from the lab's start of the hand-over: the budget this part
  // records, 1.37 measured at worst once the points' glow and opening were set on pictures (a doubled glow fills four times as much).
  const FILL_MOST = 1.6;
  const set: WorldHeld[] = Array.from({ length: 20_000 }, (_, at) => ({
    id: `n${String(at % 4_000)}/w${String(at)}`,
    namespace: `n${String(at % 4_000)}`,
    use: (at * 37) % 900,
  }));
  const fill = (systems: ReturnType<typeof systemsOf>, eye: { x: number; y: number; z: number }, focus: number) => {
    const out = { size: 0, light: 0 };
    let covered = 0;
    for (const { place, worlds } of systems)
      for (const { radius } of worlds) {
        const distance = Math.hypot(place.x - eye.x, place.y - eye.y, place.z - eye.z);
        softPoint(radius, { distance, focus, focal: FOCAL }, out);
        if (out.light > 0) covered += Math.PI * out.size * out.size;
      }
    return covered / (WIDTH * HEIGHT);
  };

  it("fills a few screens at most at 20,000 worlds, wherever the eye stands past a cluster's distance", () => {
    const systems = systemsOf(set);
    fc.assert(
      fc.property(
        fc.double({ min: -600, max: 600, noNaN: true }),
        fc.double({ min: -600, max: 600, noNaN: true }),
        fc.double({ min: 0.85 * MOOD_SCALE, max: 6 * MOOD_SCALE, noNaN: true }),
        (x, z, height) => {
          expect(fill(systems, { x, y: height, z }, height)).toBeLessThanOrEqual(FILL_MOST);
        },
      ),
      { numRuns: 12 },
    );
  });
});

describe("pointTint", () => {
  const tintAt = (place: { x: number; y: number; z: number }) => {
    const stage = { x: 0, y: 0, z: 0 };
    toScene(place, stage);
    const out = { red: 0, green: 0, blue: 0 };
    pointTint(stage, out);
    return out;
  };

  it("is warm at home, rose and peach: red first, blue last, never a hard primary", () => {
    const { red, green, blue } = tintAt({ x: 0, y: 0, z: 0 });
    expect(red).toBeGreaterThan(green);
    expect(green).toBeGreaterThan(blue);
    expect(blue).toBeGreaterThan(0.05);
    expect(Math.max(red, green, blue)).toBeLessThanOrEqual(1);
  });

  // The mood's own bound (mood.test.ts): a channel moves at most 0.02 for a unit's step. A point keeps it, so two systems a cell apart never
  // jump from one colour to another, even where the mood is dark and its hue turns.
  it("takes the mood of where it stands: the same place the same colour, and the colour moves over the field as smoothly as the mood", () => {
    const at = { x: 40, y: 1, z: -30 };
    expect(tintAt(at)).toEqual(tintAt({ ...at }));
    const hues = new Set<string>();
    for (let x = -30_000; x <= 30_000; x += 3.1) {
      const { red, green, blue } = tintAt({ x, y: 0, z: x / 2 });
      hues.add(red > blue ? "warm" : "cool");
      const step = tintAt({ x: x + 1, y: 0, z: x / 2 });
      for (const [before, after] of [
        [red, step.red],
        [green, step.green],
        [blue, step.blue],
      ] as const)
        expect(Math.abs(after - before)).toBeLessThanOrEqual(0.02);
    }
    expect(hues).toEqual(new Set(["warm", "cool"]));
  });
});

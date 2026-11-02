import { describe, expect, it } from "vitest";
import { EARTH_PLACE, systemsOf, type WorldHeld } from "../cosmos/system.ts";
import { distanceOf, type Point } from "../space/cell.ts";
import { wholeShare } from "../space/whole.ts";
import { DIVE, diveAt } from "./dive.ts";
import { restView } from "./rest.ts";
import { cameraOf, DEGREE, eyeAt, Look } from "./restLook.ts";

// The home's dive (7d7; Alexis, 2026-11-02): from the whole cosmos down to the view at rest's eye, in a few seconds, the Earth ahead all
// the way. A pure path from the rest it ends on, so the same rest gives the same dive and a flight can take it (7g).
const FRAMES = 60;
const STEPS = 400;

// Sets of `systems` namespaces, `each` worlds in each, their use spread so sizes differ.
const set = (systems: number, each: number): WorldHeld[] =>
  Array.from({ length: systems }, (_, system) =>
    Array.from({ length: each }, (__, world) => ({
      id: `s${String(system)}/w${String(world)}`,
      namespace: `s${String(system)}`,
      use: 1 + ((system * 7 + world * 3) % 11) * 15,
    })),
  ).flat();
const SETS = [
  ["100 systems", () => set(100, 2)],
  ["1,000 systems", () => set(1_000, 2)],
  ["300 systems of four", () => set(300, 4)],
] as const;

// Eyes at rest the search may give: 24 to 28 units out, 6 to 30 degrees over the disc, 60 degrees round at most.
const RESTS = [
  [26, 7, 27.6],
  [24, 6, -60],
  [28, 30, 60],
  [25, 18, 0],
] as const;
const restOf = ([distance, slant, turn]: readonly [number, number, number]) =>
  eyeAt(distance, slant * DEGREE, turn * DEGREE);

const at = (rest: Point, along: number): Point => {
  const out = { x: NaN, y: NaN, z: NaN };
  diveAt(rest, along, out);
  return out;
};
// Its distance from the Earth, its slant over the disc and its turn round from the map's z: the terms the view at rest is searched in.
const polar = (eye: Point) => {
  const distance = distanceOf(eye, EARTH_PLACE);
  return {
    distance,
    slant: Math.asin((eye.y - EARTH_PLACE.y) / distance),
    turn: Math.atan2(eye.x - EARTH_PLACE.x, eye.z - EARTH_PLACE.z),
  };
};
const path = (rest: Point) => Array.from({ length: STEPS + 1 }, (_, step) => at(rest, step / STEPS));

describe("the dive's path", () => {
  it.each(RESTS)(
    "ends exactly on the view at rest's eye, %f units out, %f degrees over the disc, %f round",
    (...terms) => {
      const rest = restOf(terms);
      const end = at(rest, 1);
      expect(end.x).toBeCloseTo(rest.x, 9);
      expect(end.y).toBeCloseTo(rest.y, 9);
      expect(end.z).toBeCloseTo(rest.z, 9);
    },
  );

  it.each(RESTS)(
    "starts where the whole cosmos holds the view, over the disc enough to read it as one: %f, %f, %f",
    (...terms) => {
      const rest = restOf(terms);
      const { distance, slant } = polar(at(rest, 0));
      expect(wholeShare(distance)).toBe(1);
      // No farther than it must (the design review of 7d7): a sixth nearer, the whole cosmos would start to give the view up.
      expect(wholeShare((5 / 6) * distance)).toBeLessThan(1);
      expect(slant).toBeGreaterThanOrEqual(25 * DEGREE - 1e-12);
      // A still start, wherever the dive waits for what it shows; a clock it cannot read keeps it there.
      expect(at(rest, -1)).toEqual(at(rest, 0));
      expect(at(rest, Number.NaN)).toEqual(at(rest, 0));
      expect(at(rest, 2)).toEqual(at(rest, 1));
    },
  );

  it.each(RESTS)("only comes in: its distance from the Earth falls at every step, %f, %f, %f", (...terms) => {
    const distances = path(restOf(terms)).map((eye) => distanceOf(eye, EARTH_PLACE));
    for (let step = 1; step < distances.length; step += 1)
      expect(distances[step] ?? NaN).toBeLessThan(distances[step - 1] ?? NaN);
  });

  it.each(RESTS)(
    "moves no frame by more than a twentieth of its way to the Earth, and lands with no snap: %f, %f, %f",
    (...terms) => {
      const rest = restOf(terms);
      const frames = Math.round(DIVE.seconds * FRAMES);
      const eyes = Array.from({ length: frames + 1 }, (_, frame) => at(rest, frame / frames));
      for (let frame = 1; frame <= frames; frame += 1) {
        const [before, now] = [eyes[frame - 1], eyes[frame]];
        if (before === undefined || now === undefined) throw new Error("no eye");
        expect(distanceOf(before, now)).toBeLessThanOrEqual(distanceOf(now, EARTH_PLACE) / 20);
      }
      const [last, end] = [eyes.at(-2), eyes.at(-1)];
      if (last === undefined || end === undefined) throw new Error("no eye");
      expect(distanceOf(last, end)).toBeLessThan(0.001);
    },
  );

  // The red pass (8): its distance falls in its log, so the Earth grows at an even pace, half of it half way, never more than twice as fast
  // as on average; it swings round a little, one way, to the rest's turn.
  it.each(RESTS)(
    "comes in at an even pace in its distance's log, and turns a little, one way: %f, %f, %f",
    (...terms) => {
      const rest = restOf(terms);
      const [start, end] = [polar(at(rest, 0)), polar(rest)];
      const progress = (eye: Point) =>
        Math.log(start.distance / polar(eye).distance) / Math.log(start.distance / end.distance);
      expect(progress(at(rest, 0.5))).toBeCloseTo(0.5, 1);
      const rates = Array.from(
        { length: STEPS },
        (_, step) => (progress(at(rest, (step + 1) / STEPS)) - progress(at(rest, step / STEPS))) * STEPS,
      );
      expect(Math.max(...rates)).toBeLessThanOrEqual(2.2 * (rates.reduce((sum, rate) => sum + rate, 0) / rates.length));
      const off = (eye: Point) =>
        Math.atan2(Math.sin(polar(eye).turn - end.turn), Math.cos(polar(eye).turn - end.turn));
      expect(Math.abs(off(at(rest, 0)))).toBeGreaterThanOrEqual(20 * DEGREE);
      expect(Math.abs(off(at(rest, 0)))).toBeLessThanOrEqual(60 * DEGREE);
      const offs = path(rest).map(off);
      for (let step = 1; step < offs.length; step += 1)
        expect(Math.abs(offs[step] ?? NaN)).toBeLessThanOrEqual(Math.abs(offs[step - 1] ?? NaN) + 1e-12);
    },
  );

  it("takes a few seconds, its fade a small part of them, and gives up waiting before the arrival could feel stuck", () => {
    expect(DIVE.seconds).toBeGreaterThanOrEqual(3);
    expect(DIVE.seconds).toBeLessThanOrEqual(7);
    expect(DIVE.fade).toBeLessThanOrEqual(DIVE.seconds / 5);
    expect(DIVE.hold + DIVE.dissolve).toBeGreaterThanOrEqual(2);
    expect(DIVE.hold + DIVE.dissolve).toBeLessThanOrEqual(4);
    expect(DIVE.fade).toBeLessThan(DIVE.hold);
    expect(DIVE.wait).toBeLessThanOrEqual(5);
  });
});

describe("the stars as the eye comes in", () => {
  // Not a planetarium (Alexis, 2026-11-02): the stars as the eye comes in keep their natural spread, never a lattice. A lattice's nearest
  // gaps are all alike (spread 0); Onyx's read 0.55 to 0.74 and these sets 0.58 or more along the dive (the part's probe, 2026-11-03).
  it.each(SETS)("shows the stars in no lattice as the eye comes in, on %s", (_, file) => {
    const systems = systemsOf(file());
    const { eye: rest } = restView(systems);
    let judged = 0;
    for (let step = 0; step < 12; step += 1) {
      const { distance, slant, turn } = polar(at(rest, step / 12));
      const look = new Look(cameraOf({ distance, slant, turn }), { width: 1728, height: 1080 });
      const seen = systems
        .map(({ place }) => look.seen(place))
        .filter(({ x, y, depth }) => depth > 0 && x >= 0 && x <= 1728 && y >= 0 && y <= 1080);
      const sample = seen.filter((_, index) => index % Math.ceil(seen.length / 300) === 0);
      if (sample.length < 8) continue;
      judged += 1;
      const gaps = sample.map((one, index) =>
        Math.min(
          ...sample.flatMap((other, at_) => (at_ === index ? [] : [Math.hypot(one.x - other.x, one.y - other.y)])),
        ),
      );
      const mean = gaps.reduce((sum, gap) => sum + gap, 0) / gaps.length;
      const spread = Math.sqrt(gaps.reduce((sum, gap) => sum + (gap - mean) ** 2, 0) / gaps.length) / mean;
      expect(spread).toBeGreaterThan(0.3);
    }
    expect(judged).toBeGreaterThanOrEqual(10);
  });
});

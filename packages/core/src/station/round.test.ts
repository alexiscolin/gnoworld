import { describe, expect, it } from "vitest";
import { EARTH_PLACE, EARTH_RADIUS } from "../cosmos/system.ts";
import { composed } from "../frame/composition.ts";
import { offMoon, type MoonRing } from "../frame/earthMoon.ts";
import { Look, looksFrom, type Seen } from "../frame/restLook.ts";
import { onOrbit, stationsRound, type Placed } from "./round.ts";
import { earthCamera, sceneryOf } from "./scenery.ts";

// Where the stations stand, pinned where StrykerJS found round.ts loose (8n's run, 2026-11-05): the rules on inputs where each decides,
// found by running every survivor on many asked files. The survivors no input tells apart are in the ledger, F5518.
const ring: MoonRing = { reach: 2.2, tilt: 0.3, roll: 0.2, moon: 0.27, rest: 1 };
const TURN = 2 * Math.PI;

// The phase a station stands at on its orbit, read back from its place: onOrbit undone.
function phaseOf({ orbit: { tilt, node }, place }: Placed): number {
  const [dx, dz] = [place.x - EARTH_PLACE.x, place.z - EARTH_PLACE.z];
  const along = dx * Math.cos(node) + dz * Math.sin(node);
  const flat = -dx * Math.sin(node) + dz * Math.cos(node);
  const across = Math.abs(Math.cos(tilt)) > 0.3 ? flat / Math.cos(tilt) : (place.y - EARTH_PLACE.y) / Math.sin(tilt);
  return (Math.atan2(across, along) + TURN) % TURN;
}
const quarters = (phases: readonly number[]) =>
  [0, 1, 2, 3].map((quarter) => phases.filter((phase) => Math.floor(phase / (Math.PI / 2)) === quarter).length);
// Whether a lone station `seed`, at a size among the 401 floats round `near`, stands where `exactly` holds.
function standsOn(seed: string, near: number, exactly: (one: Placed) => boolean): boolean {
  const float = new Float64Array([near]);
  const bits = new BigInt64Array(float.buffer);
  const start = (bits[0] ?? 0n) - 200n;
  return Array.from({ length: 401 }, (_, at) => {
    bits[0] = start + BigInt(at);
    const [one] = stationsRound([{ seed, size: float[0] ?? NaN }], ring).close;
    return one !== undefined && exactly(one);
  }).some(Boolean);
}
const files = (count: number, length: number) =>
  Array.from({ length: count }, (_, file) =>
    Array.from({ length }, (_, n) => ({ seed: `set ${String(file)} ${String(n)}`, size: ((n * 7 + file) % 11) / 10 })),
  );

describe("onOrbit", () => {
  it("lifts a leaning orbit's far side over the disc and sinks it under when it leans the other way", () => {
    expect(onOrbit({ reach: 2, tilt: Math.PI / 2, node: 0 }, Math.PI / 2).y).toBeCloseTo(EARTH_PLACE.y + 2, 9);
    expect(onOrbit({ reach: 2, tilt: -Math.PI / 2, node: 0 }, Math.PI / 2).y).toBeCloseTo(EARTH_PLACE.y - 2, 9);
  });
});

describe("stationsRound", () => {
  it("gives a station a reach from half to 1.15, by its size held to 0 to 1", () => {
    const sizes = [0, 0.5, 1, 2, -1];
    const round = stationsRound(
      sizes.map((size) => ({ seed: `sized ${String(size)}`, size })),
      ring,
    );
    const radii = new Map([...round.close, ...round.belt].map(({ size, radius }) => [size, radius]));
    expect(radii.get(0)).toBeCloseTo(0.5, 12);
    expect(radii.get(0.5)).toBeCloseTo(0.825, 12);
    expect(radii.get(1)).toBeCloseTo(1.15, 12);
    expect(radii.get(2)).toBeCloseTo(1.15, 12);
    expect(radii.get(-1)).toBeCloseTo(0.5, 12);
  });

  it("stands a station alone near the Earth: the nearest place that reads clear is taken first", () => {
    const reach = Array.from({ length: 200 }, (_, n) => {
      const [one] = stationsRound([{ seed: `alone ${String(n)}`, size: 0.5 }], ring).close;
      return (one?.orbit.reach ?? Infinity) / EARTH_RADIUS;
    });
    // Measured: 3.90 Earth radii on average; the first clear place in the draws' own order stands at 5.60.
    expect(reach.reduce((sum, one) => sum + one, 0) / reach.length).toBeLessThan(4.5);
  });

  it("turns the bodies' orbits and their places on them all the way round", () => {
    const close = files(6, 40).flatMap((asked) => stationsRound(asked, ring).close);
    expect(close.length).toBeGreaterThan(40);
    expect(Math.max(...close.map(({ orbit }) => orbit.node))).toBeGreaterThan(1.5 * Math.PI);
    for (const count of quarters(close.map(phaseOf))) expect(count).toBeGreaterThan(close.length / 8);
  });

  it("gives every light of the belt its own place, its orbit and its place on it all the way round", () => {
    const { belt } = stationsRound(files(1, 60)[0] ?? [], ring);
    expect(belt.length).toBeGreaterThan(40);
    expect(new Set(belt.map(({ place }) => `${String(place.x)} ${String(place.z)}`)).size).toBe(belt.length);
    expect(Math.max(...belt.map(({ orbit }) => orbit.node))).toBeGreaterThan(1.5 * Math.PI);
    for (const count of quarters(belt.map(phaseOf))) expect(count).toBeGreaterThan(belt.length / 8);
  });

  // Near sizes found by a search (names `edge 0` to `edge 2999`, each try's size solved for its bound), a lone station's nearest clear place stands on a bound: a bound is kept, never passed. Which float hits
  // it exactly hangs on the engine's Math functions (Chromium's and Node's differ by a bit), so each run scans the floats round the size.
  it("stands a body exactly at the Earth's least gap, and on a phone exactly at the screen's right edge", () => {
    const [look] = looksFrom(earthCamera());
    const phone = new Look(earthCamera(), { width: 390, height: 844 });
    if (look === undefined) throw new Error("no screen");
    const { earth } = look;
    const gap = ({ place, radius }: Placed) => {
      const seen = look.ball(place, radius);
      return Math.hypot(seen.x - earth.x, seen.y - earth.y) - seen.radius - earth.radius;
    };
    expect(standsOn("edge 3", 0.05540347923023921, (one) => gap(one) === 0.4 * earth.radius + 24)).toBe(true);
    expect(standsOn("edge 3", 0.6178026516015254, ({ place, radius }) => phone.ball(place, radius).right === 390)).toBe(
      true,
    );
  });

  // 7x: every rule a body stands by, on each of the video's screens, with what was placed before it: the files where each decides.
  it("stands every body off the Earth, the page, the Moon's path and the planets, and composed with those before it, on every screen", () => {
    const planets = sceneryOf();
    for (const asked of files(10, 16)) {
      const { close } = stationsRound(asked, ring);
      for (const look of looksFrom(earthCamera())) {
        const { earth, width, height } = look;
        const scenery = planets.map(({ place, radius, ring: rings }) => look.ball(place, radius * (rings?.outer ?? 1)));
        const spots = close.map(({ place, radius }) => look.ball(place, radius));
        for (const [at, seen] of spots.entries()) {
          const name = `${close[at]?.seed ?? ""} on ${String(width)}`;
          const before = spots.slice(0, at);
          expect(look.whole(seen, 24) && look.clear(seen, 24), name).toBe(true);
          const offEarth = Math.hypot(seen.x - earth.x, seen.y - earth.y) - seen.radius - earth.radius;
          expect(offEarth, name).toBeGreaterThanOrEqual(0.4 * earth.radius + 24);
          expect(offMoonPath(look, seen), name).toBe(true);
          expect(leastGap(seen, [...before, ...scenery]), name).toBeGreaterThanOrEqual(34);
          expect(composed([...before, seen], earth, { deep: false, lights: [look.star], width, height }), name).toBe(
            true,
          );
        }
      }
    }
  });
});

const offMoonPath = (look: Look, seen: Seen) =>
  Array.from({ length: 24 }, (_, rest) => offMoon(look, [seen], { ...ring, rest: (rest * Math.PI) / 12 })).every(
    Boolean,
  );
const leastGap = (seen: Seen, others: readonly Seen[]) =>
  Math.min(...others.map((other) => Math.hypot(seen.x - other.x, seen.y - other.y) - seen.radius - other.radius));

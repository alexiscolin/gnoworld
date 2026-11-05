import fc from "fast-check";
import { describe, expect, it } from "vitest";
import { EARTH_PLACE, EARTH_RADIUS } from "../cosmos/system.ts";
import { offMoon, type MoonRing } from "../frame/earthMoon.ts";
import { Look, looksFrom } from "../frame/restLook.ts";
import { reachOf } from "./parts.ts";
import { stationsRound } from "./round.ts";
import { earthCamera, earthEye, earthTopEye, offEarthViews, sceneryOf } from "./scenery.ts";
import { stationOf } from "./station.ts";
import { alikeStations, lookOf } from "./variety.ts";

// The fourteen stations the team's file ships (earthOrbit.json), by name and size.
const SHIPPED = [
  ["Adena", 0.9],
  ["Gnoscan", 0.85],
  ["GnoSwap", 0.7],
  ["Gno Playground", 0.6],
  ["Gno Faucet Hub", 0.45],
  ["gnodev", 0.45],
  ["tx-indexer", 0.35],
  ["gnopls", 0.35],
  ["gnomcp", 0.35],
  ["Gno Native Kit", 0.3],
  ["Zenao", 0.3],
  ["gnosh.ai", 0.3],
  ["gnobro", 0.2],
  ["Supernova", 0.1],
] as const;
const names = fc.stringMatching(/^[A-Za-z][A-Za-z0-9 .-]{0,15}$/);

describe("stationOf", () => {
  it("builds the same station from the same name and size, its parts within its reach", () => {
    fc.assert(
      fc.property(names, fc.double({ min: 0, max: 1, noNaN: true }), (seed, size) => {
        const station = stationOf(seed, size);
        expect(stationOf(seed, size)).toEqual(station);
        expect(station.parts.length).toBeGreaterThan(0);
        for (const part of station.parts) expect(reachOf(part)).toBeLessThanOrEqual(1 + 1e-9);
        expect(Math.max(...station.parts.map(reachOf))).toBeCloseTo(1, 9);
        expect(Math.hypot(station.spine.x, station.spine.y, station.spine.z)).toBeCloseTo(1, 9);
        expect(Math.abs(station.spin)).toBeGreaterThanOrEqual(0.04);
        expect(Math.abs(station.spin)).toBeLessThanOrEqual(0.16);
      }),
      { numRuns: 200 },
    );
  });

  it("holds a size out of range to the range", () => {
    expect(stationOf("Adena", 3)).toEqual({ ...stationOf("Adena", 1), size: 1 });
    expect(stationOf("Adena", -1)).toEqual({ ...stationOf("Adena", 0), size: 0 });
  });

  // The repetition golden (7x): no two of the shipped names, nor of a fixed set of names at sizes across the range, build alike.
  it("builds no two of the shipped stations alike, nor two of eighty names", () => {
    const looks = SHIPPED.map(([seed, size]) => ({ seed, look: lookOf(stationOf(seed, size)) }));
    for (const [at, a] of looks.entries())
      for (const b of looks.slice(at + 1)) expect(alikeStations(a.look, b.look), `${a.seed} and ${b.seed}`).toBe(false);
    const many = Array.from({ length: 80 }, (_, n) => {
      const seed = `project ${String(n)}`;
      return { seed, look: lookOf(stationOf(seed, (n % 10) / 9)) };
    });
    const alike = many.flatMap((a, at) =>
      many
        .slice(at + 1)
        .filter((b) => alikeStations(a.look, b.look))
        .map((b) => `${a.seed} ~ ${b.seed}`),
    );
    expect(alike).toEqual([]);
  });

  // 7x: past 0.7 a station is an artificial world, its great wheel or shell far past its hub: it holds many more parts, and its hub stands
  // within half its reach.
  it("builds an artificial world's great parts from 0.7 alone", () => {
    const seeds = Array.from({ length: 100 }, (_, n) => `project ${String(n)}`);
    const mean = (size: number) =>
      seeds.reduce((sum, seed) => sum + stationOf(seed, size).parts.length, 0) / seeds.length;
    expect(mean(0.7)).toBeGreaterThan(2 * mean(0.69));
    expect(mean(0.69)).toBeLessThan(2 * mean(0.3));
  });

  it("reads a station as itself, and one part more as another", () => {
    const station = stationOf("Gnoscan", 0.85);
    expect(alikeStations(lookOf(station), lookOf(station))).toBe(true);
    const more = { ...station, parts: [...station.parts, ...station.parts.slice(0, 1)] };
    expect(alikeStations(lookOf(station), lookOf(more))).toBe(false);
  });
});

describe("stationsRound", () => {
  const ring: MoonRing = { reach: 2.2, tilt: 0.3, roll: 0.2, moon: 0.27, rest: 1 };
  const asked = SHIPPED.map(([seed, size]) => ({ seed, size }));

  it("places every station once, twelve at most as bodies, the rest in the belt, the same every time", () => {
    const round = stationsRound(asked, ring);
    expect(stationsRound(asked, ring)).toEqual(round);
    expect(round.close.length).toBeLessThanOrEqual(12);
    expect([...round.close, ...round.belt].map(({ seed }) => seed).sort()).toEqual(
      asked.map(({ seed }) => seed).sort(),
    );
  });

  it("tries the largest first, then the file's order", () => {
    const tied = [
      { seed: "b small", size: 0.2 },
      { seed: "a large", size: 0.9 },
      { seed: "c tied", size: 0.5 },
      { seed: "d tied", size: 0.5 },
    ];
    const { close } = stationsRound(tied, ring);
    const rank = (seed: string) => tied.findIndex((one) => one.seed === seed);
    const ranks = close.map(({ seed }) => rank(seed));
    const sorted = [...ranks].sort((x, y) => (tied[y]?.size ?? 0) - (tied[x]?.size ?? 0) || x - y);
    expect(close.length).toBeGreaterThan(1);
    expect(ranks).toEqual(sorted);
  });

  it("stands each body on its orbit, 2.8 to 8 Earth radii out, and each light 10 to 15 out, near the disc", () => {
    const many = Array.from({ length: 30 }, (_, n) => ({ seed: `project ${String(n)}`, size: (n % 7) / 6 }));
    const { close, belt } = stationsRound(many, ring);
    expect(belt.length).toBeGreaterThanOrEqual(18);
    const out = ({ place }: { place: { x: number; y: number; z: number } }) =>
      Math.hypot(place.x - EARTH_PLACE.x, place.y - EARTH_PLACE.y, place.z - EARTH_PLACE.z);
    for (const one of close) {
      expect(out(one)).toBeCloseTo(one.orbit.reach, 9);
      expect(one.orbit.reach / EARTH_RADIUS).toBeGreaterThanOrEqual(2.8);
      expect(one.orbit.reach / EARTH_RADIUS).toBeLessThanOrEqual(8);
    }
    for (const one of belt) {
      expect(out(one)).toBeCloseTo(one.orbit.reach, 9);
      expect(one.orbit.reach / EARTH_RADIUS).toBeGreaterThanOrEqual(10);
      expect(one.orbit.reach / EARTH_RADIUS).toBeLessThanOrEqual(15);
      expect(Math.abs(one.orbit.tilt)).toBeLessThanOrEqual(0.06);
    }
  });

  // 7x: whole on the video's screens with its label's room over it, off the rail's band, the page's text, the Moon's whole path, the
  // scenery's planets and each other; on a phone whole with its label or off it.
  it("stands every body clear of all that stands round the Earth, on every screen and a phone", () => {
    const many = [
      ...asked,
      ...Array.from({ length: 80 }, (_, n) => ({ seed: `project ${String(n)}`, size: (n % 5) / 4 })),
    ];
    const { close } = stationsRound(many, ring);
    expect(close).toHaveLength(12);
    const planets = sceneryOf();
    for (const look of looksFrom(earthCamera())) {
      const spots = close.map((one) => ({ seed: one.seed, seen: look.ball(one.place, one.radius) }));
      const scenery = planets.map(({ place, radius, ring: rings }) => look.ball(place, radius * (rings?.outer ?? 1)));
      for (const [at, { seed, seen }] of spots.entries()) {
        expect(look.whole(seen, 24), seed).toBe(true);
        expect(seen.top, seed).toBeGreaterThanOrEqual(34 + 24);
        expect(seen.x + seen.radius, seed).toBeLessThan(look.width - 160);
        expect(look.clear(seen, 24), seed).toBe(true);
        for (let rest = 0; rest < 24; rest += 1)
          expect(offMoon(look, [seen], { ...ring, rest: (rest * Math.PI) / 12 }), `${seed} at ${String(rest)}`).toBe(
            true,
          );
        for (const other of [...scenery, ...spots.slice(0, at).map(({ seen: one }) => one)])
          expect(
            Math.hypot(seen.x - other.x, seen.y - other.y) - seen.radius - other.radius,
            seed,
          ).toBeGreaterThanOrEqual(34);
      }
    }
    const phone = new Look(earthCamera(), { width: 390, height: 844 });
    for (const one of close) {
      const seen = phone.ball(one.place, one.radius);
      const whole = seen.left >= 0 && seen.right <= 390 && seen.top >= 34 && seen.bottom <= 844;
      expect(phone.off({ ...seen, top: seen.top - 34 }) || whole, one.seed).toBe(true);
    }
  });
});

// 7x2: the eye glides between the Earth's two views; a station or a planet near that way would cross the eye.
describe("the way between the Earth's views", () => {
  it("reads nothing off it at either eye or between them, and a point's distance square to it past its ends", () => {
    const [rest, top] = [earthEye(), earthTopEye()];
    expect(offEarthViews(rest)).toBeCloseTo(0, 9);
    expect(offEarthViews(top)).toBeCloseTo(0, 9);
    const middle = { x: (rest.x + top.x) / 2, y: (rest.y + top.y) / 2, z: (rest.z + top.z) / 2 };
    expect(offEarthViews(middle)).toBeCloseTo(0, 9);
    expect(offEarthViews({ x: middle.x, y: middle.y + 5, z: middle.z })).toBeGreaterThan(0);
    const beyond = { x: 2 * top.x - rest.x, y: 2 * top.y - rest.y, z: 2 * top.z - rest.z };
    expect(offEarthViews(beyond)).toBeCloseTo(Math.hypot(top.x - rest.x, top.y - rest.y, top.z - rest.z), 9);
  });

  it("stands the scenery's planets nearest the eye first, each off the way", () => {
    const planets = sceneryOf();
    const eye = earthEye();
    const far = planets.map(({ place }) => Math.hypot(place.x - eye.x, place.y - eye.y, place.z - eye.z));
    expect(far).toEqual([...far].sort((a, b) => a - b));
    for (const { place, radius } of planets) expect(offEarthViews(place)).toBeGreaterThan(radius);
  });
});

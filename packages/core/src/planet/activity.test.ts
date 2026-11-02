import fc from "fast-check";
import { describe, expect, it } from "vitest";
import { auroraOf, RUN_BLOCKS, STORM_WINDOW_MS, stormsOf } from "./activity.ts";

// A world's pace (ADR-0002 §3 and §10): an aurora means a run of calls, then fades, and is never always on; storms mean its rooms' pace,
// one large and two small at most. Every intensity follows the logarithm of its count and is capped: a quiet world shows a little, the
// busiest floods nothing. Calls merge into one intensity: there is no flash per call.
const NEWEST = 4_000_000;
const count = fc.oneof(fc.nat(10_000_000), fc.constantFrom(Number.NaN, Infinity, -1, -Infinity));

describe("auroraOf", () => {
  it("lights no aurora on a world never called, or whose calls were never read", () => {
    expect(auroraOf({ calls: 0, lastHeight: NEWEST }, NEWEST, 500)).toBe(0);
    expect(auroraOf({ calls: null, lastHeight: null }, NEWEST, 500)).toBe(0);
    expect(auroraOf({ calls: 40, lastHeight: null }, NEWEST, 500)).toBe(0);
    expect(auroraOf({ calls: 40, lastHeight: NEWEST }, null, 500)).toBe(0);
  });

  it("is never always on: past a run's blocks after its last call it has faded out", () => {
    expect(auroraOf({ calls: 900, lastHeight: NEWEST - RUN_BLOCKS }, NEWEST, 500)).toBe(0);
    expect(auroraOf({ calls: 900, lastHeight: NEWEST - RUN_BLOCKS * 5 }, NEWEST, 500)).toBe(0);
  });

  it("fades as the run gets older, and never flashes back", () => {
    const at = (since: number) => auroraOf({ calls: 300, lastHeight: NEWEST - since }, NEWEST, 500);
    expect(at(0)).toBeGreaterThan(at(RUN_BLOCKS / 4));
    expect(at(RUN_BLOCKS / 4)).toBeGreaterThan(at(RUN_BLOCKS / 2));
    expect(at(RUN_BLOCKS / 2)).toBeGreaterThan(at((RUN_BLOCKS * 3) / 4));
  });

  it("grows with the calls on a log ladder against the universe, capped at 1", () => {
    const of = (calls: number) => auroraOf({ calls, lastHeight: NEWEST }, NEWEST, 500);
    expect(of(5)).toBeGreaterThan(0);
    expect(of(50)).toBeGreaterThan(of(5));
    expect(of(500)).toBe(1);
    expect(of(50_000)).toBe(1);
    expect(of(50) - of(5)).toBeGreaterThan(of(500) - of(450));
  });

  it("weighs the calls against the universe's reference, not a fixed ladder", () => {
    expect(auroraOf({ calls: 500, lastHeight: NEWEST }, NEWEST, 5000)).toBeCloseTo(
      Math.log1p(500) / Math.log1p(5000),
      12,
    );
  });

  it("reads half the light halfway through the run", () => {
    const full = auroraOf({ calls: 200, lastHeight: NEWEST }, NEWEST, 500);
    expect(auroraOf({ calls: 200, lastHeight: NEWEST - RUN_BLOCKS / 2 }, NEWEST, 500)).toBeCloseTo(full / 2, 12);
  });

  it("calls no run a beacon in a quiet universe: its ladder starts at 31 calls", () => {
    expect(auroraOf({ calls: 1, lastHeight: NEWEST }, NEWEST, 0)).toBeCloseTo(Math.log1p(1) / Math.log1p(31), 12);
  });

  it("stays a share whatever it is handed", () => {
    fc.assert(
      fc.property(fc.tuple(count, count, count, count), ([calls, lastHeight, newest, top]) => {
        const aurora = auroraOf({ calls, lastHeight }, newest, top);
        expect(aurora).toBeGreaterThanOrEqual(0);
        expect(aurora).toBeLessThanOrEqual(1);
      }),
    );
  });
});

describe("stormsOf", () => {
  const T = 1_800_000_000_000;
  const lines = (count: number, from = T) => Array.from({ length: count }, (_, at) => from - at * 1000);

  it("raises no storm over rooms with nothing said in the window", () => {
    expect(stormsOf([], T)).toEqual([0, 0, 0]);
    expect(stormsOf([T - STORM_WINDOW_MS - 1, T - STORM_WINDOW_MS * 3], T)).toEqual([0, 0, 0]);
  });

  it("raises one large storm first, then two small ones as the pace climbs, never more", () => {
    const [large, first, second] = stormsOf(lines(2), T);
    expect(large).toBeGreaterThan(0);
    expect([first, second]).toEqual([0, 0]);
    const busy = stormsOf(lines(300), T);
    expect(busy).toHaveLength(3);
    expect(busy[0]).toBe(1);
    expect(busy[1]).toBeGreaterThan(0);
    expect(busy[2]).toBeGreaterThan(0);
    expect(busy[1]).toBeLessThan(busy[0]);
  });

  it("counts only the lines inside the window, its edge in, and a line from the future or no time as none", () => {
    expect(stormsOf([...lines(3), T - STORM_WINDOW_MS - 5, T + 60_000, Number.NaN, Infinity], T)).toEqual(
      stormsOf(lines(3), T),
    );
    expect(stormsOf([T - STORM_WINDOW_MS], T)).toEqual(stormsOf([T], T));
  });

  it("raises the small storms in order as the pace climbs, never the second before the first", () => {
    for (let count = 0; count <= 300; count += 1) {
      const [large, first, second] = stormsOf(lines(count), T);
      if (second > 0) expect(first).toBeGreaterThanOrEqual(second);
      if (first > 0) expect(large).toBeGreaterThan(first);
    }
    const middle = stormsOf(lines(20), T);
    expect(middle[1]).toBeGreaterThan(0);
    expect(middle[2]).toBe(0);
  });

  it("grows with the pace, and stays a share", () => {
    fc.assert(
      fc.property(fc.nat(400), fc.nat(400), (some, more) => {
        const [few] = stormsOf(lines(some), T);
        const [many] = stormsOf(lines(some + more), T);
        expect(many).toBeGreaterThanOrEqual(few);
        for (const storm of stormsOf(lines(some + more), T)) {
          expect(storm).toBeGreaterThanOrEqual(0);
          expect(storm).toBeLessThanOrEqual(1);
        }
      }),
    );
  });
});

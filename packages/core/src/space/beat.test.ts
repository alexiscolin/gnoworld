import { describe, expect, it } from "vitest";
import { BLOCK_MS } from "../planet/activity.ts";
import { beatAt } from "./beat.ts";

// The sun's beat (ADR-0001 §7, "gno.land as the sun, pulsing on each block"; plan answer 11): the great star swells once a block, at the
// chain's pace from the time the worlds' file was written, and rests between. A sign: a file read more than an hour from its writing (the
// job missed two passes) tells no pace, so it gives none; one read fresh keeps beating as long as the page stays.
const HOUR = 3_600_000;
const WRITTEN = Date.parse("2026-11-03T06:00:00.000Z");
const STEP = 10;
// The beat sampled every 10 ms through `blocks` blocks from the file's time.
const READ = WRITTEN + 600_000;
const sampled = (blocks: number) =>
  Array.from({ length: (blocks * BLOCK_MS) / STEP }, (_, at) => beatAt(WRITTEN, WRITTEN + at * STEP, READ));
const blockOf = (beats: readonly number[], block: number) =>
  beats.slice((block * BLOCK_MS) / STEP, ((block + 1) * BLOCK_MS) / STEP);

describe("the sun's beat", () => {
  it("swells to its full once a block, within a quarter of a second of the block", () => {
    const beats = sampled(5);
    for (let block = 0; block < 5; block += 1) {
      const one = blockOf(beats, block);
      const top = Math.max(...one);
      expect(top).toBeGreaterThanOrEqual(0.99);
      expect(one.indexOf(top) * STEP).toBeLessThanOrEqual(250);
    }
  });

  it("rests between two: still for more than half the block, never under nothing nor past its full", () => {
    const beats = sampled(3);
    expect(beats.filter((value) => value === 0).length).toBeGreaterThan(beats.length / 2);
    for (const value of beats) {
      expect(value).toBeGreaterThanOrEqual(0);
      expect(value).toBeLessThanOrEqual(1);
    }
  });

  it("rises fast and falls slowly, once: no second swell, no jump between two frames", () => {
    const one = blockOf(sampled(1), 0);
    const top = one.indexOf(Math.max(...one));
    const end = one.findIndex((value, at) => at > top && value === 0);
    expect(top).toBeLessThan(end - top);
    for (let at = 1; at <= top; at += 1) expect(one[at] ?? 0).toBeGreaterThanOrEqual(one[at - 1] ?? 0);
    for (let at = top + 1; at < one.length; at += 1) expect(one[at] ?? 0).toBeLessThanOrEqual(one[at - 1] ?? 0);
    for (let at = 1; at < one.length; at += 1)
      expect(Math.abs((one[at] ?? 0) - (one[at - 1] ?? 0))).toBeLessThanOrEqual(0.08);
    // Across a block's end, into the next rise.
    expect(
      Math.abs(beatAt(WRITTEN, WRITTEN + BLOCK_MS - 1, READ) - beatAt(WRITTEN, WRITTEN + BLOCK_MS, READ)),
    ).toBeLessThanOrEqual(0.08);
  });

  it("keeps its phase: the same instant of a block twenty minutes on, and before the file's time too", () => {
    for (const into of [0, 90, 400, 1700, 3999]) {
      const now = WRITTEN + into;
      expect(beatAt(WRITTEN, now + 300 * BLOCK_MS, READ)).toBeCloseTo(beatAt(WRITTEN, now, READ), 12);
      expect(beatAt(WRITTEN, now - 7 * BLOCK_MS, READ)).toBeCloseTo(beatAt(WRITTEN, now, READ), 12);
    }
  });

  it("keeps beating on a page left open: a file read fresh beats hours on", () => {
    for (const later of [2 * HOUR, 9 * HOUR]) expect(beatAt(WRITTEN, WRITTEN + later + 200, READ)).toBeGreaterThan(0.5);
  });

  it("gives none from a file read more than an hour from its writing, before or after: no pace known", () => {
    for (const [read, now] of [
      [WRITTEN + HOUR + 1, WRITTEN + 200],
      [WRITTEN + 5 * HOUR, WRITTEN + 5 * HOUR + 200],
      [WRITTEN - HOUR - 1, WRITTEN + 200],
    ] as const)
      expect(beatAt(WRITTEN, now, read)).toBe(0);
    // An hour to the millisecond still tells it.
    expect(beatAt(WRITTEN, WRITTEN + 200, WRITTEN + HOUR)).toBeGreaterThan(0.5);
    expect(beatAt(WRITTEN, WRITTEN + 200, WRITTEN - HOUR)).toBeGreaterThan(0.5);
  });

  it("falls as the square of what is left of its fall: a quarter halfway, nothing at its end and not before", () => {
    const at = (into: number) => beatAt(WRITTEN, WRITTEN + into, READ);
    expect(at(200)).toBe(1);
    expect(at(200 + 550)).toBeCloseTo(0.25, 12);
    expect(at(1290)).toBeGreaterThan(0);
    expect(at(1300)).toBe(0);
  });

  it("gives none from a file with no time: no time, no chain to beat for", () => {
    for (const now of [WRITTEN, WRITTEN + 100, WRITTEN + 2000]) expect(beatAt(Number.NaN, now, now)).toBe(0);
  });
});

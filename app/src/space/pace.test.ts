import { describe, expect, it } from "vitest";
import { gapFor, Governor, lowered, raised } from "./pace.ts";

describe("gapFor", () => {
  it("lets a frame that moves by the hand or by an ease come at the screen's rate", () => {
    expect(gapFor("full", true)).toBe(0);
    expect(gapFor("full", false)).toBe(0);
  });

  it("holds the ambient drawing to 60 Hz, and to 30 Hz where the window has no focus", () => {
    expect(gapFor("ambient", true)).toBeGreaterThan(15);
    expect(gapFor("ambient", true)).toBeLessThan(17);
    expect(gapFor("none", false)).toBeGreaterThan(32);
    expect(gapFor("none", false)).toBeLessThan(34);
  });
});

const frames = (governor: Governor, deltas: readonly number[], seconds: number): string[] => {
  const said: string[] = [];
  for (let t = 0, i = 0; t < seconds * 1000; i += 1) {
    const d = deltas[i % deltas.length] ?? 16.7;
    const verdict = governor.feed(d);
    if (verdict !== undefined) said.push(verdict);
    t += d;
  }
  return said;
};
// A GPU at its limit: beats missed unevenly.
const LATE = [16.7, 50];

describe("Governor", () => {
  it("steps down where the median frame misses its beat unevenly", () => {
    expect(frames(new Governor(), LATE, 3.5)).toEqual(["down"]);
  });

  it("says it once a window, never on every frame after the first slow one", () => {
    expect(frames(new Governor(), LATE, 6.6)).toEqual(["down", "down"]);
  });

  it("never steps down a machine that keeps up, at 60 or 120 Hz", () => {
    expect(frames(new Governor(), [16.7], 20)).not.toContain("down");
    expect(frames(new Governor(), [8.3], 20)).not.toContain("down");
  });

  it("never steps down a steady cap: a browser giving 30 Hz to save the battery is no weak GPU", () => {
    expect(frames(new Governor(), [33.3], 60)).toEqual([]);
  });

  it("is not moved by a few long frames, a stall or a load, the median holding", () => {
    expect(frames(new Governor(), [16.7, 16.7, 16.7, 100], 20)).not.toContain("down");
  });

  it("does not let a stall end its window early", () => {
    const governor = new Governor();
    const before = Array.from({ length: 20 }, (_, i) => governor.feed(i % 2 === 0 ? 20 : 60));
    expect(before).not.toContain("down");
    expect(governor.feed(2300)).toBeUndefined();
  });

  it("does not judge a window of under 20 frames", () => {
    const governor = new Governor();
    const said = Array.from({ length: 16 }, (_, i) => governor.feed(i % 2 === 0 ? 150 : 250));
    expect(said).not.toContain("down");
  });

  it("starts its window anew after an event it was told of", () => {
    const governor = new Governor();
    frames(governor, LATE, 2.5);
    governor.reset();
    expect(frames(governor, LATE, 2.5)).toEqual([]);
  });

  it("says up once frames have kept up for ten windows after a step down", () => {
    const governor = new Governor();
    frames(governor, LATE, 3.5);
    expect(frames(governor, [16.7], 29)).toEqual([]);
    expect(frames(governor, [16.7], 3.5)).toEqual(["up"]);
  });

  it("does not step back up after a step down that followed its step up", () => {
    const governor = new Governor();
    frames(governor, LATE, 3.5);
    frames(governor, [16.7], 33);
    expect(frames(governor, LATE, 6.6)).toContain("down");
    expect(frames(governor, [16.7], 70)).toEqual([]);
  });
});

describe("lowered and raised", () => {
  it("lower by a quarter, down to 1, and no lower", () => {
    expect(lowered(2)).toBe(1.75);
    expect(lowered(1.25)).toBe(1);
    expect(lowered(1)).toBe(1);
    expect(lowered(0.8)).toBe(0.8);
  });

  it("raise by a quarter, to no cap at 2", () => {
    expect(raised(1.5)).toBe(1.75);
    expect(raised(1.75)).toBe(Infinity);
  });
});

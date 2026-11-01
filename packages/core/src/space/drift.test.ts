import fc from "fast-check";
import { describe, expect, it } from "vitest";
import { driftAt, turnAt } from "./drift.ts";

const spot = () => ({ x: 0, y: 0, z: 0 });
const length = (a: { x: number; y: number; z: number }) => Math.hypot(a.x, a.y, a.z);
const moved = (from: number, to: number) => {
  const a = spot();
  const b = spot();
  driftAt(a, from);
  driftAt(b, to);
  return length({ x: b.x - a.x, y: b.y - a.y, z: b.z - a.z });
};

describe("driftAt", () => {
  it("gives the same offset for the same second", () => {
    const a = spot();
    const b = spot();
    driftAt(a, 12.5);
    driftAt(b, 12.5);
    expect(a).toEqual(b);
  });

  it("writes the offset whole into the spot it is given: one reused spot, as a frame has it", () => {
    const reused = spot();
    driftAt(reused, 3);
    driftAt(reused, 12.5);
    const fresh = spot();
    driftAt(fresh, 12.5);
    expect(reused).toEqual(fresh);
  });

  it("holds its value a second in, along its heading, into the view", () => {
    const at = spot();
    driftAt(at, 1);
    expect(at.x).toBeCloseTo(-2.72319, 4);
    expect(at.y).toBeCloseTo(-0.7906, 4);
    expect(at.z).toBeCloseTo(8.31276, 4);
  });

  it("starts behind where the view rests, and comes forward, -z being ahead", () => {
    const start = spot();
    const later = spot();
    driftAt(start, 0);
    driftAt(later, 8);
    expect(start.z).toBeGreaterThan(0);
    expect(later.z).toBeLessThan(start.z);
    expect(length(start)).toBeGreaterThan(length(later));
  });

  it("slows through the arrival, then keeps a steady pace", () => {
    expect(moved(0, 0.5)).toBeGreaterThan(moved(2, 2.5) * 1.5);
    expect(moved(2, 2.5)).toBeGreaterThan(moved(6, 6.5));
    expect(moved(30, 31)).toBeCloseTo(moved(60, 61), 3);
    expect(moved(30, 31)).toBeGreaterThan(0);
  });

  it("never jumps: a step of a frame moves it a small way", () => {
    fc.assert(
      fc.property(fc.double({ min: 0, max: 86_400, noNaN: true }), (seconds) => {
        expect(moved(seconds, seconds + 1 / 60)).toBeLessThan(1);
      }),
    );
  });
});

describe("turnAt", () => {
  const turn = (seconds: number) => {
    const out = { yaw: NaN, pitch: NaN };
    turnAt(out, seconds);
    return out;
  };
  const DEGREE = Math.PI / 180;

  it("starts looking straight ahead", () => {
    expect(turn(0)).toEqual({ yaw: 0, pitch: 0 });
  });

  it("gives the same second the same look", () => {
    expect(turn(47.5)).toEqual(turn(47.5));
  });

  it("goes round a circle from straight ahead, a quarter of its 150 s to the side", () => {
    expect(turn(37.5).yaw).toBeCloseTo(0.26, 6);
    expect(turn(37.5).pitch).toBeCloseTo(0.26, 6);
    expect(turn(75).yaw).toBeCloseTo(0, 6);
    expect(turn(75).pitch).toBeCloseTo(0.52, 6);
    expect(turn(150).pitch).toBeCloseTo(0, 6);
  });

  it("never stops: about the video's pan at every second of its way round", () => {
    fc.assert(
      fc.property(fc.double({ min: 0, max: 86_400, noNaN: true }), (seconds) => {
        const [here, next] = [turn(seconds), turn(seconds + 1)];
        const moved = Math.hypot(next.yaw - here.yaw, next.pitch - here.pitch);
        expect(moved).toBeGreaterThan(0.55 * DEGREE);
        expect(moved).toBeLessThan(0.7 * DEGREE);
      }),
    );
  });
});

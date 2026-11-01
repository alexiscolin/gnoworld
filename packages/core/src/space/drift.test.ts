import fc from "fast-check";
import { describe, expect, it } from "vitest";
import { driftAt } from "./drift.ts";

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

  it("starts behind where the view rests, and comes forward", () => {
    const start = spot();
    const later = spot();
    driftAt(start, 0);
    driftAt(later, 8);
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

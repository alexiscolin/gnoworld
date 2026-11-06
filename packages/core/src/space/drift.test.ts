import fc from "fast-check";
import { describe, expect, it } from "vitest";
import { driftAt, glideAt, orbitTime, swayAt, turnAt } from "./drift.ts";

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

describe("glideAt", () => {
  const offset = (seconds: number) => {
    const out = spot();
    glideAt(out, seconds);
    return out;
  };

  it("starts where the drift starts, so the worlds and the sky arrive as one", () => {
    const start = spot();
    driftAt(start, 0);
    expect(offset(0)).toEqual(start);
  });

  it("ends where the eye rests, for a world must not be left behind by the sky's cruise", () => {
    expect(length(offset(120))).toBeLessThan(1e-6);
    fc.assert(
      fc.property(fc.double({ min: 40, max: 86_400, noNaN: true }), (seconds) => {
        expect(length(offset(seconds))).toBeLessThan(1e-3);
      }),
    );
  });

  it("is the drift less its cruise, at every second: the worlds and the sky arrive at one pace", () => {
    fc.assert(
      fc.property(fc.double({ min: 0.1, max: 600, noNaN: true }), (seconds) => {
        const [drift, glide] = [spot(), spot()];
        driftAt(drift, seconds);
        glideAt(glide, seconds);
        const cruise = { x: drift.x - glide.x, y: drift.y - glide.y, z: drift.z - glide.z };
        expect(length(cruise) / (0.6 * seconds)).toBeCloseTo(1, 3);
      }),
    );
  });

  it("slows all the way, along the drift's heading", () => {
    const [a, b, c] = [offset(0), offset(1), offset(4)].map(length);
    expect(a).toBeGreaterThan(b ?? 0);
    expect(b).toBeGreaterThan(c ?? 0);
    expect(offset(1).x / offset(1).z).toBeCloseTo(offset(0).x / offset(0).z, 9);
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

// 7d6, Alexis's "on devrait avoir de la profondeur": at rest the eye sways a little across the view, so the near worlds slide past the far.
describe("swayAt", () => {
  const sway = (seconds: number) => {
    const out = { across: NaN, up: NaN };
    swayAt(out, seconds);
    return out;
  };

  it("starts at the view's own rest, which reduced motion keeps", () => {
    expect(sway(0)).toEqual({ across: 0, up: 0 });
  });

  it("gives the same second the same sway, written whole into the spot it is given", () => {
    const reused = { across: 9, up: 9 };
    swayAt(reused, 3);
    swayAt(reused, 41.5);
    expect(reused).toEqual(sway(41.5));
  });

  it("stays within a unit of the rest across and half a unit up, so the view it composes holds", () => {
    fc.assert(
      fc.property(fc.double({ min: 0, max: 1e6, noNaN: true }), (seconds) => {
        const { across, up } = sway(seconds);
        expect(Math.abs(across)).toBeLessThanOrEqual(1);
        expect(Math.abs(up)).toBeLessThanOrEqual(0.5);
      }),
    );
  });

  it("never stops for long: over any two seconds after the first it moves a tenth of a unit or more", () => {
    for (let seconds = 1; seconds < 300; seconds += 1.7) {
      const [a, b] = [sway(seconds), sway(seconds + 2)];
      expect(Math.hypot(b.across - a.across, b.up - a.up)).toBeGreaterThan(0.1);
    }
  });

  it("never jumps: a frame's step moves it a hundredth of a unit at most", () => {
    for (let seconds = 0; seconds < 120; seconds += 0.37) {
      const [a, b] = [sway(seconds), sway(seconds + 1 / 60)];
      expect(Math.hypot(b.across - a.across, b.up - a.up)).toBeLessThan(0.01);
    }
  });
});

// Alexis's decision through the chief, 2026-11-02: the worlds turn at a fifth of their spin, so the eye's sway reads as depth.
describe("orbitTime", () => {
  it("is the clock every world turns by, bodies and points alike: a fifth of the seconds", () => {
    expect(orbitTime(10)).toBeCloseTo(2, 12);
    expect(orbitTime(0)).toBe(0);
  });
});

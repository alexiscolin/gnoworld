import { describe, expect, it } from "vitest";
import type { Goal } from "./flight.ts";
import { Rig } from "./rig.ts";

const goalAt = (x: number, distance: number): Goal => ({
  pose: (out) => {
    Object.assign(out.look, { x, y: 0, z: 0 });
    Object.assign(out.way, { x: 0, y: 0, z: 1 });
    Object.assign(out.up, { x: 0, y: 1, z: 0 });
    out.distance = distance;
    return true;
  },
});

describe("Rig", () => {
  // A flight asked as another all but lands (a link clicked as the first screen settles) eases in from rest: it never starts at its full
  // speed, which was a step and a turn in its first frame.
  it("starts a flight asked as another all but lands from rest, not at full speed", () => {
    const rig = new Rig();
    rig.jump(goalAt(0, 4));
    rig.fly(goalAt(400, 4));
    let peak = 0;
    while (rig.along < 0.995) {
      rig.advance(16, false);
      peak = Math.max(peak, rig.speed);
    }
    expect(rig.flying).toBe(true);
    rig.fly(goalAt(3000, 4));
    rig.advance(16, false);
    expect(rig.speed).toBeLessThan(0.1 * peak);
  });

  it("starts a flight asked mid-flight at the speed the camera has", () => {
    const rig = new Rig();
    rig.jump(goalAt(0, 4));
    rig.fly(goalAt(400, 4));
    for (let frame = 0; frame < 118; frame += 1) rig.advance(16, false);
    const before = rig.speed;
    expect(before).toBeGreaterThan(0);
    rig.fly(goalAt(3000, 4));
    rig.advance(16, false);
    expect(Math.abs(rig.speed - before) / before).toBeLessThan(0.35);
  });

  it("starts a flight asked at rest from rest", () => {
    const rig = new Rig();
    rig.jump(goalAt(0, 4));
    rig.fly(goalAt(3000, 4));
    rig.advance(16, false);
    expect(rig.speed).toBeLessThan(0.05);
  });
});

import { describe, expect, it } from "vitest";
import { Free, WANDER } from "./free.ts";
import { blankPose, type Pose } from "./pose.ts";
import { REACH } from "./rig.ts";

const poseAt = (look: [number, number, number], distance: number): Pose => {
  const pose = blankPose();
  Object.assign(pose.look, { x: look[0], y: look[1], z: look[2] });
  pose.distance = distance;
  return pose;
};

// A drag of 120 px, then the let-go, then `seconds` of inertia at `fps`.
function dragged(free: Free, pose: Pose, { fps, seconds }: { fps: number; seconds: number }): void {
  free.drag({ dx: 120, dy: 0, height: 800, seconds: 1 / 30 });
  free.advance(1000 / fps, false, { pose, reach: REACH });
  free.release(false);
  for (let t = 0; t < seconds; t += 1 / fps) free.advance(1000 / fps, false, { pose, reach: REACH });
}

describe("Free", () => {
  it("swings the look round a far pivot only as far as the eye stands off it", () => {
    const [far, near] = [poseAt([2750, 0, -650], 0.2), poseAt([300, 0, 700], 4700)];
    for (const [pose, most] of [
      [far, 25],
      [near, Infinity],
    ] as const) {
      const free = new Free();
      Object.assign(free.pivot, { x: 0, y: 0, z: 0 });
      const before = { ...pose.look };
      dragged(free, pose, { fps: 60, seconds: 2 });
      expect(Math.hypot(pose.look.x - before.x, pose.look.y - before.y, pose.look.z - before.z)).toBeLessThan(most);
    }
  });

  it("carries a drag's inertia as far at 15 fps as at 60", () => {
    const [a, b] = [poseAt([0, 0, 0], 100), poseAt([0, 0, 0], 100)];
    dragged(new Free(), a, { fps: 60, seconds: 2 });
    dragged(new Free(), b, { fps: 15, seconds: 2 });
    expect(Math.abs(a.way.x - b.way.x)).toBeLessThan(0.1);
  });
});

// How far the view turns in one 16 ms frame, in radians, the galaxy's slow turn on.
const stepOf = (free: Free, pose: Pose): number => {
  const before = { ...pose.way };
  free.advance(16, false, { pose, reach: REACH });
  return Math.acos(Math.min(1, before.x * pose.way.x + before.y * pose.way.y + before.z * pose.way.z));
};
const idleFor = (free: Free, pose: Pose, seconds: number): void => {
  for (let t = 0; t < seconds; t += 0.016) free.advance(16, false, { pose, reach: REACH });
};

describe("Free's slow turn", () => {
  const galaxy = (): [Free, Pose] => {
    const free = new Free();
    free.wander = WANDER.galaxy;
    const pose = poseAt([0, 0, 0], 100);
    Object.assign(pose.way, { x: 0.6, y: 0.5, z: 0.6245 });
    return [free, pose];
  };

  it("turns on its own after its second of rest", () => {
    const [free, pose] = galaxy();
    idleFor(free, pose, 5);
    expect(stepOf(free, pose)).toBeGreaterThan(0.0015);
  });

  it("eases to a stop over 3 s once a minute has passed with no input", () => {
    const [free, pose] = galaxy();
    idleFor(free, pose, 59);
    expect(stepOf(free, pose)).toBeGreaterThan(0.0015);
    idleFor(free, pose, 1.4);
    const easing = stepOf(free, pose);
    expect(easing).toBeGreaterThan(0);
    expect(easing).toBeLessThan(0.0019);
    idleFor(free, pose, 3);
    expect(stepOf(free, pose)).toBeLessThan(1e-6);
  });

  it("turns again at the first input, after its second of rest", () => {
    const [free, pose] = galaxy();
    idleFor(free, pose, 70);
    free.wheel(0);
    idleFor(free, pose, 6);
    expect(stepOf(free, pose)).toBeGreaterThan(0.0015);
  });

  it("says it turns by itself after its second of rest, until the minute is past", () => {
    const [free, pose] = galaxy();
    idleFor(free, pose, 0.5);
    expect(free.turning).toBe(false);
    idleFor(free, pose, 5);
    expect(free.turning).toBe(true);
    idleFor(free, pose, 60);
    expect(free.turning).toBe(false);
  });

  it("stops after a minute of real time at 12 frames a second, where each step is capped at 50 ms", () => {
    const [free, pose] = galaxy();
    for (let t = 0; t < 63.5; t += 1 / 12) free.advance(50, false, { pose, reach: REACH, real: 1000 / 12 });
    expect(free.turning).toBe(false);
    expect(stepOf(free, pose)).toBeLessThan(1e-6);
  });
});

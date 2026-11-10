import { describe, expect, it } from "vitest";
import { Free } from "./free.ts";
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

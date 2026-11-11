import { describe, expect, it } from "vitest";
import { Vector3 } from "three";
import { Flight, type Goal } from "./flight.ts";
import { blankPose, type Pose, type Spot } from "./pose.ts";

const MS = 16;
const at = (way: [number, number, number], up: [number, number, number]): Pose => {
  const pose = blankPose();
  Object.assign(pose.look, { x: 0, y: 0, z: 0 });
  Object.assign(pose.way, { x: way[0], y: way[1], z: way[2] });
  Object.assign(pose.up, { x: up[0], y: up[1], z: up[2] });
  return pose;
};
const angle = (a: Spot, b: Spot): number => new Vector3(a.x, a.y, a.z).angleTo(new Vector3(b.x, b.y, b.z));

const goalOf = (to: Pose): Goal => ({
  pose: (out) => {
    Object.assign(out.look, to.look);
    Object.assign(out.way, to.way);
    Object.assign(out.up, to.up);
    return true;
  },
});

// The most the way or the up turned in one frame of a whole flight to `to`, in degrees a second, and how long it took.
function fastest(from: Pose, to: Pose): { rate: number; seconds: number; end: Pose } {
  const flight = new Flight(from, goalOf(to));
  const out = blankPose();
  const last = { way: { ...from.way }, up: { ...from.up } };
  let [rate, seconds] = [0, 0];
  while (seconds < 30) {
    const landed = flight.advance(MS, false, out);
    seconds += MS / 1000;
    rate = Math.max(rate, angle(last.way, out.way) / (MS / 1000), angle(last.up, out.up) / (MS / 1000));
    Object.assign(last.way, out.way);
    Object.assign(last.up, out.up);
    if (landed) break;
  }
  return { rate: (rate * 180) / Math.PI, seconds, end: out };
}

describe("Flight turns", () => {
  it("never turns the camera faster than 180 degrees a second, from the front to the back", () => {
    const { rate } = fastest(at([0, 0, 1], [0, 1, 0]), at([0, 0, -1], [0, 1, 0]));
    expect(rate).toBeLessThanOrEqual(185);
  });

  it("never turns faster than 180 degrees a second on a near-antipodal way", () => {
    const { rate } = fastest(at([0, 0, 1], [0, 1, 0]), at([0.01, 0, -1], [0, 1, 0]));
    expect(rate).toBeLessThanOrEqual(185);
  });

  it("takes longer for a larger angle, and no longer than needed for a small one", () => {
    const small = fastest(at([0, 0, 1], [0, 1, 0]), at([0.1, 0, 1], [0, 1, 0]));
    const half = fastest(at([0, 0, 1], [0, 1, 0]), at([1, 0, 0], [0, 1, 0]));
    const back = fastest(at([0, 0, 1], [0, 1, 0]), at([0, 0, -1], [0, 1, 0]));
    expect(back.seconds).toBeGreaterThan(half.seconds);
    expect(half.seconds).toBeGreaterThanOrEqual(small.seconds);
  });

  it("keeps the up upright and square to the way on a half turn, never flipping it over", () => {
    const flight = new Flight(at([0, 0, 1], [0, 1, 0]), goalOf(at([0, 0, -1], [0, 1, 0])));
    const out = blankPose();
    for (let step = 0; step < 4000; step += 1) {
      const landed = flight.advance(MS, false, out);
      expect(out.up.y).toBeGreaterThan(0);
      expect(out.way.x * out.up.x + out.way.y * out.up.y + out.way.z * out.up.z).toBeCloseTo(0, 5);
      if (landed) break;
    }
    expect(out.way.z).toBeCloseTo(-1, 6);
    expect(out.up.y).toBeCloseTo(1, 6);
  });
});

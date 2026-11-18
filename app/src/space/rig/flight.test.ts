import { describe, expect, it } from "vitest";
import { Vector3 } from "three";
import { Flight, type Goal } from "./flight.ts";
import { blankPose, copyPose, eyeOf, spot, type Pose, type Spot } from "./pose.ts";

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

describe("a landing on a place not ready", () => {
  // Alexis: a dive a little longer gives the place time to be drawn, but only where it is not ready as the flight starts slowing; ready, the
  // flight keeps its length, so a fast machine never waits.
  const fly = (ready?: () => boolean) => {
    const from = at([0, 0, -1], [0, 1, 0]);
    from.distance = 4;
    const to = at([0, 0, -1], [0, 1, 0]);
    Object.assign(to.look, { x: 40, y: 0, z: 0 });
    to.distance = 1;
    const goal = goalOf(to);
    const flight = new Flight(from, {
      pose: (out) => goal.pose(out) && ((out.distance = to.distance), true),
      ...(ready === undefined ? {} : { ready }),
    });
    const out = blankPose();
    const steps: number[] = [];
    let last = 0;
    for (let frame = 1; frame < 2000; frame += 1) {
      const landed = flight.advance(MS, false, out);
      steps.push(flight.along - last);
      last = flight.along;
      if (landed) return { seconds: (frame * MS) / 1000, steps };
    }
    return { seconds: Infinity, steps };
  };

  it("keeps its length where the place is ready as the flight starts slowing", () => {
    expect(fly(() => true).seconds).toBe(fly().seconds);
  });

  it("lands at most a second later where it is not, slowing more gently, never stopping nor jumping", () => {
    const plain = fly();
    const slowed = fly(() => false);
    expect(slowed.seconds).toBeGreaterThan(plain.seconds + 0.5);
    expect(slowed.seconds).toBeLessThanOrEqual(plain.seconds + 1 + MS / 1000);
    const peak = Math.max(...slowed.steps);
    slowed.steps.slice(0, -1).forEach((step, frame) => {
      expect(step).toBeGreaterThan(0);
      // Its speed changes smoothly: no frame steps it by more than a twentieth of its fastest.
      if (frame > 0) expect(Math.abs(step - (slowed.steps[frame - 1] ?? 0))).toBeLessThan(peak / 20);
    });
  });

  // The review: rounding left a drawn-out flight one part in 2^52 short of its end, 75 of 1,015 never landed.
  it("lands, drawn out, whatever its length and its frames", () => {
    const never: string[] = [];
    for (let far = 5; far <= 80; far += 3)
      for (const ms of [7, 8.33, 11.1, 16, 16.67]) {
        const to = at([0, 0, -1], [0, 1, 0]);
        Object.assign(to.look, { x: far, y: 0, z: 0 });
        const flight = new Flight(at([0, 0, -1], [0, 1, 0]), { ...goalOf(to), ready: () => false });
        const out = blankPose();
        let frame = 0;
        while (!flight.advance(ms, false, out) && frame < 5000) frame += 1;
        if (frame >= 5000) never.push(`${String(far)} at ${String(ms)} ms`);
      }
    expect(never).toEqual([]);
  });

  it("asks once, as it starts slowing: ready later, it keeps the gentler landing it took", () => {
    let asked = 0;
    const once = fly(() => (asked += 1) > 1);
    expect(asked).toBe(1);
    expect(once.seconds).toBeGreaterThan(fly().seconds + 0.5);
  });
});

// The eye's speed over its distance, a second, of a pose that moved from `before` to `after` in `MS`.
const speedOf = (before: Pose, after: Pose): number => {
  const [from, to] = [eyeOf(before, spot()), eyeOf(after, spot())];
  return Math.hypot(to.x - from.x, to.y - from.y, to.z - from.z) / (MS / 1000) / after.distance;
};

describe("a flight begun while the camera moves", () => {
  // The flight to a world asked while another still runs (its route came late): the camera starts it at the speed it has, never at the
  // flight's own full speed, then changes it smoothly.
  const speeds = (): { first: number; steps: number[]; before: number } => {
    const first = at([0, 0, 1], [0, 1, 0]);
    first.distance = 4;
    const goalA = at([0, 0, 1], [0, 1, 0]);
    Object.assign(goalA.look, { x: 400, y: 0, z: 0 });
    goalA.distance = 4;
    const flight = new Flight(first, goalOf(goalA));
    const out = blankPose();
    const prev = blankPose();
    for (let frame = 0; frame < 118; frame += 1) {
      copyPose(out, prev);
      flight.advance(MS, false, out);
    }
    const before = speedOf(prev, out);
    const goalB = at([0, 0, 1], [0, 1, 0]);
    Object.assign(goalB.look, { x: 3000, y: 0, z: 0 });
    goalB.distance = 4;
    const next = new Flight(out, goalOf(goalB), { speed: before });
    const steps: number[] = [];
    for (let frame = 0; frame < 135; frame += 1) {
      copyPose(out, prev);
      next.advance(MS, false, out);
      steps.push(speedOf(prev, out));
    }
    return { first: steps[0] ?? 0, steps, before };
  };

  it("starts at the speed it has, then changes it smoothly", () => {
    const { first, steps, before } = speeds();
    expect(before).toBeGreaterThan(0.1);
    expect(Math.abs(first - before) / before).toBeLessThan(0.25);
    const peak = Math.max(...steps);
    steps.slice(1).forEach((step, frame) => {
      expect(Math.abs(step - (steps[frame] ?? 0)), `frame ${String(frame + 1)}`).toBeLessThan(peak / 6);
    });
  });
});

describe("a flight begun when the camera has all but stopped", () => {
  // The first screen's flight, nearly landed as the click comes: the next flight eases in from rest, with no step and no turn in its first
  // frame (it began at full speed, as a flight does that is asked while the camera flies).
  const turned = (speed: number): number => {
    const first = at([0, 0, 1], [0, 1, 0]);
    first.distance = 80;
    const goal = at([1, 0, 0], [0, 1, 0]);
    goal.distance = 20;
    const flight = new Flight(first, goalOf(goal), { speed });
    const out = blankPose();
    flight.advance(50, false, out);
    return angle(first.way, out.way);
  };

  it("turns the way by next to nothing in its first frame", () => {
    expect(turned(0)).toBeLessThan(0.005);
  });

  it("turns it at its full rate where the camera flies as fast", () => {
    expect(turned(Infinity)).toBeGreaterThan(0.03);
  });
});

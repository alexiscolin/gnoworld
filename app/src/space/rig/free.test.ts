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

  // Alexis on v0.1.6: the galaxy, and a system's view, stopped dead the moment the mouse moved. The turn read over a quarter of a second
  // (a system's is small), by atan2: acos loses an angle this small.
  const turnIn = ([free, pose]: [Free, Pose], seconds: number, each?: () => void): number => {
    const before = { ...pose.way };
    for (let t = 0; t < seconds; t += 0.016) {
      each?.();
      free.advance(16, false, { pose, reach: REACH });
    }
    const { x, y, z } = pose.way;
    const cross = Math.hypot(before.y * z - before.z * y, before.z * x - before.x * z, before.x * y - before.y * x);
    return Math.atan2(cross, before.x * x + before.y * y + before.z * z);
  };
  for (const [view, wander] of [
    ["the galaxy", WANDER.galaxy],
    ["a system's view", WANDER.near],
  ] as const) {
    const turning = (): [Free, Pose, number] => {
      const [free, pose] = galaxy();
      free.wander = wander;
      idleFor(free, pose, 8);
      return [free, pose, turnIn([free, pose], 0.25)];
    };

    it(`keeps ${view} turning at its speed while the pointer moves: a move only starts the minute of rest over`, () => {
      const [free, pose, full] = turning();
      expect(full).toBeGreaterThan(0);
      for (let at = 0; at < 8; at += 1)
        expect(
          turnIn([free, pose], 0.25, () => {
            free.rouse();
          }),
        ).toBeGreaterThan(0.95 * full);
    });

    it(`eases ${view}'s turn down when the hand takes the view, never in one frame, and back up after its rest`, () => {
      const [free, pose, full] = turning();
      free.rouse(true);
      expect(turnIn([free, pose], 0.016), "the frame after the hand").toBeGreaterThan(0.8 * (full / 16));
      expect(free.turning, "still turning as it eases: the loop keeps drawing").toBe(true);
      // A turn's inertia, 0.32 s: over the next quarter second it keeps about 0.66 of its way.
      const eased = turnIn([free, pose], 0.25);
      expect(eased).toBeLessThan(0.75 * full);
      expect(eased).toBeGreaterThan(0.55 * full);
      // A hold, as a drag is: the hand on the view each frame.
      const hold = () => {
        free.rouse(true);
      };
      turnIn([free, pose], 1.2, hold);
      expect(turnIn([free, pose], 0.25, hold), "held: no turn of its own").toBeLessThan(0.05 * full);
      turnIn([free, pose], 2, hold);
      expect(free.turning, "held long: it stops, and the loop may rest").toBe(false);
      idleFor(free, pose, wander.after + 3);
      expect(turnIn([free, pose], 0.25), "back to its speed").toBeGreaterThan(0.95 * full);
    });

    it(`starts ${view} turning again by its ramp after the minute of rest, never at full speed in one frame`, () => {
      const [free, pose, full] = turning();
      idleFor(free, pose, 66);
      expect(turnIn([free, pose], 0.25), "stopped").toBeLessThan(1e-9);
      free.rouse();
      expect(turnIn([free, pose], 0.25), "a pointer's move after the minute").toBeLessThan(0.2 * full);
      idleFor(free, pose, 3);
      expect(turnIn([free, pose], 0.25), "back to its speed").toBeGreaterThan(0.95 * full);
    });
  }

  it("stops at once when a flight takes the pose: the flight moves it then", () => {
    const [free, pose] = galaxy();
    idleFor(free, pose, 8);
    free.stop();
    expect(turnIn([free, pose], 0.25)).toBeLessThan(1e-9);
  });

  it("stops after a minute of real time at 12 frames a second, where each step is capped at 50 ms", () => {
    const [free, pose] = galaxy();
    for (let t = 0; t < 63.5; t += 1 / 12) free.advance(50, false, { pose, reach: REACH, real: 1000 / 12 });
    expect(free.turning).toBe(false);
    expect(stepOf(free, pose)).toBeLessThan(1e-6);
  });
});

describe("Free's clock rate", () => {
  const rested = (): [Free, Pose] => [new Free(), poseAt([0, 0, 0], 100)];
  const rateAfter = (free: Free, pose: Pose): number => {
    free.advance(16, false, { pose, reach: REACH });
    return free.rate;
  };

  it("runs at 1 for the minute, eases to 0 over 3 s without a jump, and stays there", () => {
    const [free, pose] = rested();
    idleFor(free, pose, 59);
    expect(rateAfter(free, pose)).toBe(1);
    let [last, jump] = [1, 0];
    for (let t = 0; t < 4.5; t += 0.016) {
      const rate = rateAfter(free, pose);
      jump = Math.max(jump, Math.abs(rate - last));
      last = rate;
    }
    expect(last).toBe(0);
    expect(jump).toBeLessThan(0.02);
  });

  it("starts again at a drag, a wheel or a rouse (a pointer move, a key), easing in over 3 s from where it stopped", () => {
    for (const hand of [
      (f: Free) => {
        f.wheel(0);
      },
      (f: Free) => {
        f.drag({ dx: 1, dy: 0, height: 800, seconds: 0.016 });
      },
      (f: Free) => {
        f.rouse();
      },
    ]) {
      const [free, pose] = rested();
      idleFor(free, pose, 70);
      expect(rateAfter(free, pose)).toBe(0);
      hand(free);
      const first = rateAfter(free, pose);
      expect(first).toBeGreaterThan(0);
      expect(first).toBeLessThan(0.02);
      idleFor(free, pose, 1.5);
      expect(rateAfter(free, pose)).toBeGreaterThan(0.3);
      idleFor(free, pose, 2);
      expect(rateAfter(free, pose)).toBe(1);
    }
  });

  it("is 0 at once under reduced motion: the orbits, spins and moons all stop with the clock", () => {
    const [free, pose] = rested();
    free.advance(16, true, { pose, reach: REACH });
    expect(free.rate).toBe(0);
  });

  it("is kept at 1 by a rouse every few seconds, however long", () => {
    const [free, pose] = rested();
    for (let t = 0; t < 130; t += 5) {
      free.rouse();
      idleFor(free, pose, 5);
    }
    expect(rateAfter(free, pose)).toBe(1);
  });
});

import { Quaternion, Vector3 } from "three";
import { expect, it } from "vitest";
import { Grab } from "./grab.ts";

const VIEW = new Quaternion();
const front = new Vector3(0, 0, 1);
const drag = (grab: Grab, [dx, dy]: number[], seconds = 0.016) => {
  grab.drag({ dx: dx ?? 0, dy: dy ?? 0, radius: 100, seconds });
};
// The hand's turn is made with the same lag as the camera's (rig/free.ts), so a drag is whole a moment after it: one second of frames.
const settle = (grab: Grab, view = VIEW, still = true) => {
  for (let t = 0; t < 1; t += 0.016) grab.advance(0.016, view, still);
};
const turned = (grab: Grab) => front.clone().applyQuaternion(grab.at);

it("turns a surface point as far as the pointer moved over it, to the right for a drag to the right", () => {
  const grab = new Grab();
  drag(grab, [50, 0]);
  settle(grab);
  expect(turned(grab).x).toBeCloseTo(Math.sin(0.5), 3);
  expect(turned(grab).y).toBeCloseTo(0, 3);
});

it("turns it down for a drag down, about the view's right", () => {
  const grab = new Grab();
  drag(grab, [0, 50]);
  settle(grab);
  expect(turned(grab).y).toBeCloseTo(-Math.sin(0.5), 3);
});

it("turns nothing while the pointer holds still, and keeps the turn it was given", () => {
  const grab = new Grab();
  drag(grab, [30, 0]);
  settle(grab, VIEW, false);
  const was = grab.at.clone();
  grab.advance(0.016, VIEW, false);
  grab.advance(0.016, VIEW, false);
  expect(grab.at.angleTo(was)).toBeCloseTo(0, 5);
});

it("carries on after the release over the same distance at any frame rate, then stops", () => {
  const ends = [1 / 60, 1 / 20].map((step) => {
    const grab = new Grab();
    drag(grab, [10, 0], 0.016);
    settle(grab, VIEW, false);
    const held = grab.at.clone();
    grab.release(false);
    for (let t = 0; t < 4; t += step) grab.advance(step, VIEW, false);
    expect(grab.moving).toBe(false);
    return grab.at.angleTo(held);
  });
  expect(ends[0]).toBeCloseTo(ends[1] ?? NaN, 4);
  expect(ends[0]).toBeGreaterThan(0.1);
});

it("has no inertia where it stood still before the release, nor under reduced motion", () => {
  for (const [stood, still] of [
    [true, false],
    [false, true],
  ] as const) {
    const grab = new Grab();
    drag(grab, [10, 0]);
    settle(grab, VIEW, still);
    const held = grab.at.clone();
    grab.release(stood);
    grab.advance(0.016, VIEW, still);
    expect(grab.at.angleTo(held)).toBeCloseTo(0, 5);
  }
});

it("takes its axes from the view", () => {
  const grab = new Grab();
  const view = new Quaternion().setFromAxisAngle(new Vector3(0, 1, 0), Math.PI / 2);
  drag(grab, [50, 0]);
  settle(grab, view);
  expect(grab.at.angleTo(new Quaternion().setFromAxisAngle(new Vector3(0, 1, 0), 0.5))).toBeCloseTo(0, 3);
  const other = new Grab();
  drag(other, [0, 50]);
  settle(other, view);
  expect(other.at.angleTo(new Quaternion().setFromAxisAngle(new Vector3(0, 0, -1), 0.5))).toBeCloseTo(0, 3);
});

it("stop leaves the turn and ends the speed", () => {
  const grab = new Grab();
  drag(grab, [10, 0]);
  grab.advance(0.016, VIEW, false);
  grab.release(false);
  grab.stop();
  const was = grab.at.clone();
  grab.advance(0.016, VIEW, false);
  expect(grab.at.angleTo(was)).toBeCloseTo(0, 5);
  expect(grab.moving).toBe(false);
});

it("turns every frame, one way and evenly, though the moves land every other frame, and never all in the first", () => {
  const grab = new Grab();
  const steps: number[] = [];
  for (let frame = 0; frame < 40; frame += 1) {
    if (frame % 2 === 0) drag(grab, [8, 0], 1 / 30);
    const was = grab.at.clone();
    grab.advance(0.016, VIEW, false);
    steps.push(grab.at.angleTo(was));
  }
  expect(steps[0]).toBeLessThan(0.6 * 0.08);
  const held = steps.slice(8);
  expect(Math.min(...held) / Math.max(...held)).toBeGreaterThan(0.6);
});

it("is done moving once let go and made", () => {
  const grab = new Grab();
  drag(grab, [20, 0], 1 / 30);
  grab.release(true);
  for (let t = 0; t < 1; t += 0.016) grab.advance(0.016, VIEW, false);
  expect(grab.moving).toBe(false);
});

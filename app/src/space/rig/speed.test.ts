import { PerspectiveCamera, Scene, Vector2 } from "three";
import { describe, expect, it } from "vitest";
import { Disposer } from "../disposer.ts";
import { blankPose, spot } from "./pose.ts";
import { Speed } from "./speed.ts";

const renderer = {
  getDrawingBufferSize: (size: Vector2) => size.set(64, 64),
  setRenderTarget: () => undefined,
  render: () => undefined,
};
const [stage, camera] = [new Scene(), new PerspectiveCamera()];

function flown() {
  const speed = new Speed(stage, new Disposer());
  const rig = (fast: boolean) => ({ eye: spot(), pose: blankPose(), speed: fast ? 6 : 0, flying: fast });
  const fly = () => {
    for (let i = 0; i < 40; i += 1) speed.tick(rig(true), 16);
    speed.draw(renderer, stage, camera);
  };
  const rest = (seconds: number) => {
    for (let t = 0; t < seconds; t += 0.016) speed.tick(rig(false), 16);
  };
  return { speed, fly, rest };
}

describe("Speed's blur target", () => {
  it("is made at the first fast frame, not before", () => {
    const { speed, fly } = flown();
    expect(speed.held).toBe(false);
    fly();
    expect(speed.held).toBe(true);
  });

  it("is freed ten seconds after the blur's last frame, never before", () => {
    const { speed, fly, rest } = flown();
    fly();
    rest(5);
    expect(speed.held).toBe(true);
    rest(8);
    expect(speed.held).toBe(false);
  });

  it("is made again by the next fast flight", () => {
    const { speed, fly, rest } = flown();
    fly();
    rest(12);
    fly();
    expect(speed.held).toBe(true);
  });

  it("is freed at once where the scene sleeps, as a covered page asks", () => {
    const { speed, fly } = flown();
    fly();
    speed.free();
    expect(speed.held).toBe(false);
  });
});

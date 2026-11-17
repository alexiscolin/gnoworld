import { PerspectiveCamera, Scene, Vector2 } from "three";
import { describe, expect, it } from "vitest";
import { Disposer } from "../disposer.ts";
import { blankPose, spot } from "./pose.ts";
import { Speed } from "./speed.ts";

const renderer = {
  getDrawingBufferSize: (size: Vector2) => size.set(64, 64),
  setRenderTarget: () => undefined,
  render: () => undefined,
  getRenderTarget: () => null,
  compile: () => new Set<never>(),
  getContext: () => ({ getContextAttributes: () => ({ antialias: true }) }) as unknown as WebGL2RenderingContext,
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

describe("Speed's warm-up", () => {
  it("draws the stage into the blur's kind of target after 3 s at rest, and again after the next flight, never in one", () => {
    const [warmed, compiled]: [unknown[], unknown[]] = [[], []];
    let into: unknown = null;
    const noting = {
      ...renderer,
      getRenderTarget: () => into,
      setRenderTarget: (target: unknown) => {
        into = target;
      },
      render: (scene: unknown) => {
        if (scene === stage && into !== null && (into as { width: number }).width === 1) warmed.push(into);
      },
      compile: (scene: unknown) => {
        compiled.push(scene);
        return new Set<never>();
      },
    };
    const speed = new Speed(stage, new Disposer());
    const frame = (flying: boolean, fast = false) => {
      speed.tick({ eye: spot(), pose: blankPose(), speed: fast ? 6 : 0, flying }, 16);
      speed.draw(noting as never, stage, camera);
    };
    const rest = (seconds: number) => {
      for (let t = 0; t < seconds; t += 0.016) frame(false);
    };
    rest(2.9);
    expect(warmed).toHaveLength(0);
    rest(0.2);
    expect(warmed).toEqual([expect.objectContaining({ width: 1, height: 1 })]);
    expect(compiled).toEqual([expect.any(Scene)]);
    expect(compiled[0]).not.toBe(stage);
    rest(5);
    for (let at = 0; at < 60; at += 1) frame(true, true);
    expect([warmed.length, compiled.length]).toEqual([1, 1]);
    rest(2);
    expect(warmed).toHaveLength(1);
    rest(5);
    expect([warmed.length, compiled.length]).toEqual([2, 2]);
  });
});

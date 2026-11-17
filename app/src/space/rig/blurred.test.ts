import { HalfFloatType, Object3D, PerspectiveCamera, Scene } from "three";
import { describe, expect, it } from "vitest";
import { holdOf } from "../parts/held.ts";
import { blurTarget, warmBlurred } from "./blurred.ts";

const canvas = (antialias: boolean) =>
  ({ getContext: () => ({ getContextAttributes: () => ({ antialias }) }) }) as never;

describe("blurTarget", () => {
  it.each([
    [true, 4],
    [false, 0],
  ])("takes the canvas's MSAA: antialiased %s, %i samples", (antialias, samples) => {
    const target = blurTarget(canvas(antialias), 64, 32);
    expect([target.samples, target.width, target.height]).toEqual([samples, 64, 32]);
  });
});

describe("warmBlurred", () => {
  it("draws the scene once into a pixel of the blur's kind of target, then sets back the target before and frees its own", () => {
    const drawn: { scene: unknown; into: unknown }[] = [];
    let into: unknown = "before";
    let disposed = 0;
    const renderer = {
      ...(canvas(false) as object),
      getRenderTarget: () => into,
      setRenderTarget: (target: unknown) => {
        into = target;
      },
      render: (scene: unknown) => {
        drawn.push({ scene, into });
        (into as { addEventListener(type: string, run: () => void): void }).addEventListener("dispose", () => {
          disposed += 1;
        });
      },
    };
    const scene = new Scene();
    warmBlurred(renderer as never, scene, new PerspectiveCamera());
    expect(drawn).toHaveLength(1);
    expect(drawn[0]?.scene).toBe(scene);
    expect(drawn[0]?.into).toMatchObject({ width: 1, height: 1, samples: 0, texture: { type: HalfFloatType } });
    expect(into).toBe("before");
    expect(disposed).toBe(1);
  });
});

describe("holdOf", () => {
  it("compiles a near planet as drawn into the blur's kind of target too, hidden as it is till it shows", () => {
    const compiled: unknown[] = [];
    let into: unknown = null;
    const renderer = {
      ...(canvas(false) as object),
      getRenderTarget: () => into,
      setRenderTarget: (target: unknown) => {
        into = target;
      },
      compile: () => {
        compiled.push(into);
        return new Set();
      },
      compileAsync: () => Promise.resolve(),
    };
    const drawn = { group: new Object3D(), setPlate: () => undefined };
    const device = { stage: new Scene(), renderer, camera: new PerspectiveCamera(), plate: {} };
    holdOf(drawn as never, {} as never, device as never);
    expect(compiled).toEqual([expect.objectContaining({ width: 1, height: 1, samples: 0 })]);
    expect(into).toBeNull();
  });
});

import { HalfFloatType, PerspectiveCamera, Scene } from "three";
import { describe, expect, it } from "vitest";
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
  it("draws the scene once into a pixel of the blur's kind of target, then sets back the target before", () => {
    const drawn: { scene: unknown; into: unknown }[] = [];
    let into: unknown = "before";
    const renderer = {
      ...(canvas(false) as object),
      getRenderTarget: () => into,
      setRenderTarget: (target: unknown) => {
        into = target;
      },
      render: (scene: unknown) => {
        drawn.push({ scene, into });
      },
    };
    const scene = new Scene();
    warmBlurred(renderer as never, scene, new PerspectiveCamera());
    expect(drawn).toHaveLength(1);
    expect(drawn[0]?.scene).toBe(scene);
    expect(drawn[0]?.into).toMatchObject({ width: 1, height: 1, samples: 0, texture: { type: HalfFloatType } });
    expect(into).toBe("before");
  });
});

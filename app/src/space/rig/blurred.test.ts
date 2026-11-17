import { describe, expect, it } from "vitest";
import { blurTarget } from "./blurred.ts";

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

import { afterEach, expect, it, vi } from "vitest";
import { createRenderer } from "./renderer.ts";

const made = vi.hoisted(() => ({ parameters: [] as unknown[] }));

vi.mock("three", () => ({
  ACESFilmicToneMapping: 4,
  WebGLRenderer: vi.fn(function construct(this: { info: unknown }, parameters: unknown) {
    this.info = { autoReset: true };
    made.parameters.push(parameters);
  }),
}));

afterEach(() => {
  made.parameters.length = 0;
});

const canvas = {} as HTMLCanvasElement;

it("asks for the low-power adapter, an opaque buffer and no stencil, on the canvas it is given", () => {
  createRenderer(canvas, false);
  expect(made.parameters).toEqual([
    { canvas, antialias: false, alpha: false, stencil: false, powerPreference: "low-power" },
  ]);
});

it("takes its anti-aliasing from the caller", () => {
  createRenderer(canvas, true);
  expect(made.parameters).toEqual([expect.objectContaining({ antialias: true })]);
});

it("sets the one image grade before anything compiles, for everything drawn after it", () => {
  const renderer = createRenderer(canvas, false);
  expect(renderer.toneMapping).toBe(4);
  expect(renderer.toneMappingExposure).toBe(0.8);
});

it("counts a frame's draws across its passes: the scene resets the count once a frame", () => {
  expect(createRenderer(canvas, false).info.autoReset).toBe(false);
});

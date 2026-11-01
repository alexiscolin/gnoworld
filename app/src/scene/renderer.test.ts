import { afterEach, expect, it, vi } from "vitest";
import { createRenderer } from "./renderer.ts";

const made = vi.hoisted(() => ({ parameters: [] as unknown[] }));

vi.mock("three", () => ({
  WebGLRenderer: vi.fn(function construct(parameters: unknown) {
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

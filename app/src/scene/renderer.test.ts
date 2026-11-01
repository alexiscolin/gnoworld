import { afterEach, expect, it, vi } from "vitest";
import { createRenderer } from "./renderer.ts";

const made = vi.hoisted(() => ({ parameters: [] as unknown[], clear: [] as unknown[] }));

vi.mock("three", () => ({
  WebGLRenderer: class {
    constructor(parameters: unknown) {
      made.parameters.push(parameters);
    }
    setClearColor(colour: unknown, alpha: unknown) {
      made.clear.push([colour, alpha]);
    }
  },
}));

afterEach(() => {
  made.parameters.length = 0;
  made.clear.length = 0;
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

// The frames' deep black, measured on f0004, f0005 and f0017's far corners: rgb(1, 1, 1), darker than the page's #05070d.
it("clears to the frames' deep black, opaque", () => {
  createRenderer(canvas, false);
  expect(made.clear).toEqual([[0x010101, 1]]);
});

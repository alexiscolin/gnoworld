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
  vi.unstubAllEnvs();
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

// The workshop (tuning.ts): the lab's build sets the switch, and its panel's exposure reaches the renderer at once. Each test has a registry
// of its own, the one its renderer reads.
const withRegistry = async () => {
  vi.resetModules();
  const [{ createRenderer: create }, tuning] = await Promise.all([import("./renderer.ts"), import("./tuning.ts")]);
  return { create, ...tuning };
};

it("follows the workshop's exposure in the lab: the panel's at once, the grade's own once cleared", async () => {
  vi.stubEnv("GNOWORLD_TUNING", "1");
  const { create, setTuned } = await withRegistry();
  const renderer = create(canvas, false);
  expect(renderer.toneMappingExposure).toBe(0.8);
  setTuned("grade.exposure", 1.3);
  expect(renderer.toneMappingExposure).toBe(1.3);
  setTuned("grade.exposure", undefined);
  expect(renderer.toneMappingExposure).toBe(0.8);
});

// Only the lab's own value turns it on: a switch left unset, or set to anything else, follows nothing.
it.each([undefined, "0", "true", "yes"])(
  "follows nothing outside the lab, the switch at %s: a site's renderer keeps its grade whatever the registry holds",
  async (value) => {
    vi.stubEnv("GNOWORLD_TUNING", value);
    const { create, setTuned, tunedDefaults } = await withRegistry();
    const renderer = create(canvas, false);
    setTuned("grade.exposure", 1.3);
    expect(renderer.toneMappingExposure).toBe(0.8);
    expect(tunedDefaults().has("grade.exposure")).toBe(false);
  },
);

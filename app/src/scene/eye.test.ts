import { HOME, LEAN } from "@gnoworld/core";
import { afterEach, describe, expect, it, vi } from "vitest";
import { Eye } from "./eye.ts";

// The eye a flight moves (7g): its way is added to where the view rests, so the sky and the cosmos come to it, and what it looks at stands
// in place of the view's own aim until the flight is done.
describe("the eye a flight moves", () => {
  it("rests where the view does, looking where the view looks, until a flight moves it", () => {
    const eye = new Eye();
    eye.advance(16, true);
    expect(eye.travel).toEqual({ x: 0, y: 0, z: 0 });
    expect(eye.look).toBeUndefined();
    expect(eye.worlds).toEqual(HOME);
  });

  it.each([false, true])(
    "adds the flight's way to where it stands and where the worlds are seen from, still: %s",
    (still) => {
      const eye = new Eye();
      eye.advance(0, still);
      const before = { at: { ...eye.at }, worlds: { ...eye.worlds } };
      Object.assign(eye.travel, { x: 3, y: -4, z: 120 });
      eye.advance(0, still);
      for (const [now, then] of [
        [eye.at, before.at],
        [eye.worlds, before.worlds],
      ] as const) {
        expect(now.x - then.x).toBeCloseTo(3, 9);
        expect(now.y - then.y).toBeCloseTo(-4, 9);
        expect(now.z - then.z).toBeCloseTo(120, 9);
      }
    },
  );
});

// The workshop (tuning.ts): in the lab, a mouse leans the view as far as the panel says, from the next frame; outside it, as far as LEAN.
describe("the workshop's lean", () => {
  const withRegistry = async () => {
    vi.resetModules();
    const [{ Eye: Made }, tuning] = await Promise.all([import("./eye.ts"), import("./tuning.ts")]);
    return { Made, ...tuning };
  };
  // Leant whole to the right and down, then held still: a still frame moves neither the drift nor the ease.
  const leant = (eye: Eye) => {
    eye.aim(1, -1);
    eye.advance(1e9, false);
    eye.advance(0, true);
    return { at: { ...eye.at }, worlds: { ...eye.worlds } };
  };
  const still = (eye: Eye) => {
    eye.advance(0, true);
    return { at: { ...eye.at }, worlds: { ...eye.worlds } };
  };

  afterEach(() => {
    vi.unstubAllEnvs();
  });

  it("leans the eye and the worlds as far as the panel's value in the lab, from the next frame, and as LEAN once cleared", async () => {
    vi.stubEnv("GNOWORLD_TUNING", "1");
    const { Made, setTuned, tunedDefaults } = await withRegistry();
    const eye = new Made();
    const before = leant(eye);
    expect(before.worlds.x - HOME.x).toBeCloseTo(LEAN, 9);
    expect(tunedDefaults().get("eye.lean")).toBe(LEAN);
    setTuned("eye.lean", 2 * LEAN);
    const after = still(eye);
    for (const [now, then] of [
      [after.at, before.at],
      [after.worlds, before.worlds],
    ] as const) {
      expect(now.x - then.x).toBeCloseTo(LEAN, 9);
      expect(now.y - then.y).toBeCloseTo(-LEAN, 9);
      expect(now.z).toBe(then.z);
    }
    setTuned("eye.lean", undefined);
    expect(still(eye)).toEqual(before);
  });

  it("leans nothing at the panel's 0, the drift alone moving the eye", async () => {
    vi.stubEnv("GNOWORLD_TUNING", "1");
    const { Made, setTuned } = await withRegistry();
    const eye = new Made();
    setTuned("eye.lean", 0);
    const { at, worlds } = leant(eye);
    expect(worlds).toEqual(HOME);
    expect(Number.isFinite(at.x) && Number.isFinite(at.y)).toBe(true);
  });

  it("leans as far as LEAN outside the lab, whatever the registry holds", async () => {
    const { Made, setTuned, tunedDefaults } = await withRegistry();
    const eye = new Made();
    setTuned("eye.lean", 2 * LEAN);
    expect(leant(eye).worlds.x - HOME.x).toBeCloseTo(LEAN, 9);
    expect(tunedDefaults().has("eye.lean")).toBe(false);
  });
});

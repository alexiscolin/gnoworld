import { ARRIVAL_LEAN, HOME, LEAN, type Point } from "@gnoworld/core";
import { afterEach, describe, expect, it, vi } from "vitest";
import { RestEye } from "./restEye.ts";

// The design review's second pass (F4468; the chief): at a mouse's lean to the right gnoswap's pool left under the ticker. A system's
// dynamic view says how far the eye may lean each way across and up the stage, and the eye leans each way as far as that.
const ROOM = { right: 0.2, left: 1, up: 0.6, down: 1 };
vi.mock("./restArrival.ts", () => ({
  landingAt: () => ({
    index: 1,
    view: { eye: { x: 10, y: 5, z: 3 }, postcards: [1], close: undefined },
    look: { x: 12, y: 5, z: 3 },
    postcards: new Map(),
    room: ROOM,
  }),
}));

// A Plan's landing, with a lean of its own (core's PLAN_LEAN): the workshop's share of a system's view never touches it.
const PLAN_OWN = 2;
vi.mock("./restPlan.ts", () => ({
  planAt: () => ({
    index: 1,
    view: { eye: { x: 10, y: 5, z: 3 }, postcards: [1], close: undefined },
    look: { x: 12, y: 5, z: 3 },
    postcards: new Map(),
    room: ROOM,
    lean: PLAN_OWN,
  }),
}));

describe("a dynamic view's lean, each way as far as its room says", () => {
  it("leans the eye a fifth to the right, all of it to the left, as the view's room says", async () => {
    const eye = new RestEye({});
    eye.rest({ eye: { x: 0, y: 3, z: 30 }, postcards: [], close: undefined });
    const came = vi.fn<(asking: unknown, to: Point) => void>();
    eye.arrive([], { id: "gnoswap", go: vi.fn(), plan: false }, came);
    await vi.waitFor(() => {
      expect(came).toHaveBeenCalled();
    });
    const to = came.mock.lastCall?.[1] ?? { x: NaN, y: NaN, z: NaN };
    const at = (x: number, y: number) => {
      const out = { x: 0, y: 0, z: 0 };
      eye.place({ x: to.x + x, y: to.y + y, z: to.z }, 0, out);
      return out;
    };
    const still = at(0, 0);
    const share = ARRIVAL_LEAN / LEAN;
    expect(at(1, 0).x - still.x).toBeCloseTo(share * ROOM.right, 9);
    expect(at(-1, 0).x - still.x).toBeCloseTo(-share * ROOM.left, 9);
    expect(at(0, 1).y - still.y).toBeCloseTo(share * ROOM.up, 9);
    expect(at(0, -1).y - still.y).toBeCloseTo(-share * ROOM.down, 9);
  });
});

// The workshop (tuning.ts): in the lab, a system's dynamic view takes the panel's share of the scene's lean, at once, with no new arrival, as
// the code's ARRIVAL_LEAN = LEAN / 2.2 is a share; the home's own lean is the scene's eye's (eye.ts). Home and a Plan keep theirs.
describe("the workshop's share of the lean at a system", () => {
  const SHARE = ARRIVAL_LEAN / LEAN;
  const come = async (plan: boolean | undefined) => {
    vi.resetModules();
    const [{ RestEye: Made }, tuning] = await Promise.all([import("./restEye.ts"), import("../tuning.ts")]);
    const eye = new Made({});
    eye.rest({ eye: { x: 0, y: 3, z: 30 }, postcards: [], close: undefined });
    const came = vi.fn<(asking: unknown, to: Point) => void>();
    if (plan !== undefined) {
      eye.arrive([], { id: "gnoswap", go: vi.fn(), plan }, came);
      await vi.waitFor(() => {
        expect(came).toHaveBeenCalled();
      });
    }
    const to = came.mock.lastCall?.[1] ?? HOME;
    // How far the eye moves right for a scene's eye one unit right of where it rests.
    const across = () => {
      const [still, right] = [0, 1].map((x) => {
        const out = { x: 0, y: 0, z: 0 };
        eye.place({ x: to.x + x, y: to.y, z: to.z }, 0, out);
        return out;
      });
      return (right?.x ?? NaN) - (still?.x ?? NaN);
    };
    return { across, ...tuning };
  };

  afterEach(() => {
    vi.unstubAllEnvs();
  });

  it("leans a system's view by the panel's share in the lab, at once, the home's lean left to the scene's eye", async () => {
    vi.stubEnv("GNOWORLD_TUNING", "1");
    const { across, setTuned, tunedDefaults } = await come(false);
    expect(across()).toBeCloseTo(SHARE * ROOM.right, 9);
    expect(tunedDefaults().get("eye.arrivalShare")).toBeCloseTo(SHARE, 12);
    setTuned("eye.arrivalShare", 0.8);
    expect(across()).toBeCloseTo(0.8 * ROOM.right, 9);
    setTuned("eye.lean", 2 * LEAN);
    expect(across()).toBeCloseTo(0.8 * ROOM.right, 9);
    setTuned("eye.arrivalShare", 0);
    expect(across()).toBe(0);
    setTuned("eye.arrivalShare", undefined);
    expect(across()).toBeCloseTo(SHARE * ROOM.right, 9);
  });

  it("leaves the home's view whole and a Plan's own lean as they are, whatever the share", async () => {
    vi.stubEnv("GNOWORLD_TUNING", "1");
    const home = await come(undefined);
    home.setTuned("eye.arrivalShare", 0.8);
    expect(home.across()).toBeCloseTo(1, 9);
    const plan = await come(true);
    plan.setTuned("eye.arrivalShare", 0.8);
    expect(plan.across()).toBeCloseTo((PLAN_OWN / LEAN) * ROOM.right, 9);
  });

  it("leans as far as ARRIVAL_LEAN outside the lab, whatever the registry holds", async () => {
    const { across, setTuned, tunedDefaults } = await come(false);
    setTuned("eye.arrivalShare", 0.8);
    expect(across()).toBeCloseTo(SHARE * ROOM.right, 9);
    expect(tunedDefaults().size).toBe(0);
  });
});

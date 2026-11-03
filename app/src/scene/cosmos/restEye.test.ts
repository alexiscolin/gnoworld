import { ARRIVAL_LEAN, LEAN, type Point } from "@gnoworld/core";
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

// The workshop (tuning.ts): in the lab, a system's view leans as far as the panel's arrival lean says, at once, with no new arrival; the
// home's lean, which the scene's eye already carries, is divided out. Outside the lab, ARRIVAL_LEAN.
describe("the workshop's lean at a system", () => {
  const arrived = async () => {
    vi.resetModules();
    const [{ RestEye: Made }, tuning] = await Promise.all([import("./restEye.ts"), import("../tuning.ts")]);
    const eye = new Made({});
    eye.rest({ eye: { x: 0, y: 3, z: 30 }, postcards: [], close: undefined });
    const came = vi.fn<(asking: unknown, to: Point) => void>();
    eye.arrive([], { id: "gnoswap", go: vi.fn(), plan: false }, came);
    await vi.waitFor(() => {
      expect(came).toHaveBeenCalled();
    });
    const to = came.mock.lastCall?.[1] ?? { x: NaN, y: NaN, z: NaN };
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

  it("leans as far as the panel's arrival lean in the lab, at once, the home's divided out", async () => {
    vi.stubEnv("GNOWORLD_TUNING", "1");
    const { across, setTuned, tunedDefaults } = await arrived();
    expect(across()).toBeCloseTo((ARRIVAL_LEAN / LEAN) * ROOM.right, 9);
    expect(tunedDefaults().get("eye.arrivalLean")).toBe(ARRIVAL_LEAN);
    setTuned("eye.arrivalLean", 2 * ARRIVAL_LEAN);
    expect(across()).toBeCloseTo(((2 * ARRIVAL_LEAN) / LEAN) * ROOM.right, 9);
    setTuned("eye.lean", 2 * LEAN);
    expect(across()).toBeCloseTo(((2 * ARRIVAL_LEAN) / (2 * LEAN)) * ROOM.right, 9);
    setTuned("eye.arrivalLean", undefined);
    setTuned("eye.lean", undefined);
    expect(across()).toBeCloseTo((ARRIVAL_LEAN / LEAN) * ROOM.right, 9);
  });

  it("leans as far as ARRIVAL_LEAN outside the lab, whatever the registry holds", async () => {
    const { across, setTuned, tunedDefaults } = await arrived();
    setTuned("eye.arrivalLean", 2 * ARRIVAL_LEAN);
    setTuned("eye.lean", 2 * LEAN);
    expect(across()).toBeCloseTo((ARRIVAL_LEAN / LEAN) * ROOM.right, 9);
    expect(tunedDefaults().size).toBe(0);
  });
});

import { ARRIVAL_LEAN, LEAN, type Point } from "@gnoworld/core";
import { describe, expect, it, vi } from "vitest";
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

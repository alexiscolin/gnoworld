import { describe, expect, it, vi } from "vitest";
import type { EarthDevice } from "../earth/device.ts";
import * as generated from "../planet/generated.ts";
import { BodyMaps } from "./maps.ts";

// The generated worlds' code, a chunk of its own (7b5): a fetch that fails once leaves the worlds as points, and is asked again the next
// time a world wants it, as the app's other chunks are (F1763), never left failed for the page's life (F4231).
const device = {} as EarthDevice;

describe("the generated worlds' code", () => {
  it("is asked once while it comes, and handed once it came", async () => {
    const load = vi.fn(() => Promise.resolve(generated));
    const arrived = vi.fn();
    const maps = new BodyMaps(device, arrived, { code: load });
    expect(maps.kit()).toBeUndefined();
    expect(maps.kit()).toBeUndefined();
    await vi.waitFor(() => {
      expect(arrived).toHaveBeenCalledOnce();
    });
    expect(maps.kit()).toBe(generated);
    expect(load).toHaveBeenCalledOnce();
  });

  it("asks again after a fetch that failed, and draws once it comes (F4231)", async () => {
    const load = vi.fn().mockRejectedValueOnce(new Error("no chunk")).mockResolvedValue(generated);
    const arrived = vi.fn();
    const maps = new BodyMaps(device, arrived, { code: load });
    expect(maps.kit()).toBeUndefined();
    await vi.waitFor(() => {
      maps.kit();
      expect(load).toHaveBeenCalledTimes(2);
    });
    await vi.waitFor(() => {
      expect(arrived).toHaveBeenCalledOnce();
    });
    expect(maps.kit()).toBe(generated);
    expect(load).toHaveBeenCalledTimes(2);
  });
});

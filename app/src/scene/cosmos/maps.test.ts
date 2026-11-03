import { Texture } from "three";
import { afterEach, describe, expect, it, vi } from "vitest";
import type { EarthDevice } from "../earth/device.ts";
import * as generated from "../planet/generated.ts";
import { loadMap } from "../planet/maps.ts";
import { BodyMaps } from "./maps.ts";

vi.mock("../planet/maps.ts", async (actual) => ({
  ...(await actual<typeof import("../planet/maps.ts")>()),
  loadMap: vi.fn(),
}));

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

  // 7b6's review (F4310): a world page left before the code came built the world it had freed, and fetched its maps for no one.
  it("hands code that comes after `free` to no one, and keeps it for the next ask", async () => {
    const arrived = vi.fn();
    const maps = new BodyMaps(device, arrived, { code: () => Promise.resolve(generated) });
    maps.kit();
    maps.free();
    await Promise.resolve();
    await Promise.resolve();
    expect(arrived).not.toHaveBeenCalled();
    expect(maps.kit()).toBe(generated);
  });

  // F4311: a world page whose code never came said "loading" for ever.
  it("says it failed when the code does not come, and nothing once it was freed", async () => {
    const failed = vi.fn();
    const maps = new BodyMaps(device, vi.fn(), { code: () => Promise.reject(new Error("no chunk")), failed });
    maps.kit();
    await vi.waitFor(() => {
      expect(failed).toHaveBeenCalledOnce();
    });
    maps.kit();
    maps.free();
    await Promise.resolve();
    await Promise.resolve();
    expect(failed).toHaveBeenCalledOnce();
  });
});

// F4409 (7p): a body map whose fetch failed stayed asked, never fetched again until the maps were freed, so its world's body never came.
describe("a body map that does not come", () => {
  const loading = vi.mocked(loadMap);
  const fetching = {
    renderer: { capabilities: { getMaxAnisotropy: () => 8 }, initTexture: vi.fn(), compileAsync: vi.fn() },
    base: "/",
    halved: () => false,
  } as unknown as EarthDevice;
  const fetches = (name: string) => loading.mock.calls.filter(([url]) => url.includes(name)).length;

  afterEach(() => {
    vi.useRealTimers();
    loading.mockReset();
  });

  it("is fetched again a while after it failed, and stands once it comes (F4409)", async () => {
    vi.useFakeTimers();
    const map = new Texture();
    loading.mockRejectedValueOnce(new Error("offline")).mockResolvedValue(map);
    const arrived = vi.fn();
    const maps = new BodyMaps(fetching, arrived);
    expect(maps.named("rocky")).toBeUndefined();
    await vi.advanceTimersByTimeAsync(100);
    maps.named("rocky");
    expect(fetches("rocky")).toBe(1);
    await vi.advanceTimersByTimeAsync(10_000);
    expect(arrived).toHaveBeenCalled();
    maps.named("rocky");
    await vi.advanceTimersByTimeAsync(0);
    expect(fetches("rocky")).toBe(2);
    expect(maps.named("rocky")).toBe(map);
  });

  it("is fetched a third time after two failed, and stands once that one comes (F4409)", async () => {
    vi.useFakeTimers();
    const map = new Texture();
    loading
      .mockRejectedValueOnce(new Error("offline"))
      .mockRejectedValueOnce(new Error("offline"))
      .mockResolvedValue(map);
    const maps = new BodyMaps(fetching, () => undefined);
    for (let tries = 0; tries < 6; tries += 1) {
      maps.named("rocky");
      await vi.advanceTimersByTimeAsync(20_000);
    }
    expect(fetches("rocky")).toBe(3);
    expect(maps.named("rocky")).toBe(map);
  });

  it("is given up after three fetches failed, however often it is asked (F4409)", async () => {
    vi.useFakeTimers();
    loading.mockRejectedValue(new Error("offline"));
    const maps = new BodyMaps(fetching, () => undefined);
    for (let tries = 0; tries < 20; tries += 1) {
      maps.named("rocky");
      await vi.advanceTimersByTimeAsync(60_000);
    }
    expect(fetches("rocky")).toBe(3);
  });

  it("is fetched again from the start once the maps were freed, and nothing waits after the free (F4409)", async () => {
    vi.useFakeTimers();
    loading.mockRejectedValue(new Error("offline"));
    const arrived = vi.fn();
    const maps = new BodyMaps(fetching, arrived);
    maps.named("rocky");
    await vi.advanceTimersByTimeAsync(100);
    maps.free();
    await vi.advanceTimersByTimeAsync(60_000);
    expect(arrived).not.toHaveBeenCalled();
    maps.named("rocky");
    expect(fetches("rocky")).toBe(2);
  });
});

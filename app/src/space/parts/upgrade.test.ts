import type { Texture, WebGLRenderer } from "three";
import { describe, expect, it, vi } from "vitest";
import type { Held } from "./held.ts";
import type { Maps } from "./maps.ts";
import { upgradeStep } from "./upgrade.ts";

const map = (name: string) => ({ name }) as unknown as Texture;

describe("upgradeStep", () => {
  it("holds a late full set while a flight runs, then sends it one map a frame at rest and swaps it", () => {
    const full = { day: map("day"), night: map("night"), clouds: map("clouds") };
    const maps = { fullEarth: () => full, settleFull: vi.fn() } as unknown as Maps;
    const setEarthMaps = vi.fn();
    const held = { upgraded: false, drawn: { setEarthMaps } } as unknown as Held;
    const renderer = { initTexture: vi.fn() };
    for (let frame = 0; frame < 5; frame += 1) upgradeStep(held, maps, renderer as unknown as WebGLRenderer, true);
    expect(renderer.initTexture).not.toHaveBeenCalled();
    expect(setEarthMaps).not.toHaveBeenCalled();
    for (let frame = 0; frame < 3; frame += 1) upgradeStep(held, maps, renderer as unknown as WebGLRenderer, false);
    expect(renderer.initTexture).toHaveBeenCalledTimes(3);
    expect(setEarthMaps).not.toHaveBeenCalled();
    upgradeStep(held, maps, renderer as unknown as WebGLRenderer, false);
    expect(setEarthMaps).toHaveBeenCalledWith(full);
    expect(held.upgraded).toBe(true);
  });
});

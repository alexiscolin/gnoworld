import type { Texture, WebGLRenderer } from "three";
import { describe, expect, it, vi } from "vitest";
import type { Held } from "./held.ts";
import type { Maps } from "./maps.ts";
import { upgradeStep } from "./upgrade.ts";

const map = (name: string) => ({ name }) as unknown as Texture;

describe("upgradeStep", () => {
  it("holds a late full set while a flight runs, then sends it one map a frame at rest, swaps it and frees the half-size ones", () => {
    const full = { day: map("day"), night: map("night"), clouds: map("clouds") };
    const settleFull = vi.fn();
    const maps = { fullEarth: () => full, settleFull } as unknown as Maps;
    const setEarthMaps = vi.fn();
    const held = { upgraded: false, drawn: { setEarthMaps } } as unknown as Held;
    const renderer = { initTexture: vi.fn() };
    const device = { maps, renderer: renderer as unknown as WebGLRenderer };
    for (let frame = 0; frame < 5; frame += 1) upgradeStep(held, device, true);
    expect(renderer.initTexture).not.toHaveBeenCalled();
    expect(setEarthMaps).not.toHaveBeenCalled();
    for (let frame = 0; frame < 3; frame += 1) upgradeStep(held, device, false);
    expect(renderer.initTexture).toHaveBeenCalledTimes(3);
    expect(setEarthMaps).not.toHaveBeenCalled();
    expect(settleFull).not.toHaveBeenCalled();
    upgradeStep(held, device, false);
    expect(setEarthMaps).toHaveBeenCalledWith(full);
    expect(settleFull).toHaveBeenCalledTimes(1);
    expect(held.upgraded).toBe(true);
  });
});

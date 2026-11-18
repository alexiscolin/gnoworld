import { Group, Mesh, ShaderMaterial, Texture, type WebGLRenderer } from "three";
import { describe, expect, it, vi } from "vitest";
import type { Held } from "./held.ts";
import type { Maps } from "./maps.ts";
import { FOCUS_S, upgradeStep } from "./upgrade.ts";

const fullSet = () => ({ day: new Texture(), night: new Texture(), clouds: new Texture() });
const frame = (busy: boolean, still = false) => ({ delta: 1 / 60, still, busy });
const gpu = () => ({ initTexture: vi.fn() });

describe("upgradeStep", () => {
  it("holds a late full set while a flight runs, then sends it one map a frame at rest, swaps it and brings it into focus", () => {
    const full = fullSet();
    const settleFull = vi.fn();
    const maps = { fullEarth: () => full, fullCame: full, settleFull } as unknown as Maps;
    const setEarthMaps = vi.fn();
    const held = { upgraded: false, drawn: { setEarthMaps, group: new Group() } } as unknown as Held;
    const renderer = gpu();
    const { initTexture } = renderer;
    const device = { maps, renderer: renderer as unknown as WebGLRenderer };
    for (let at = 0; at < 5; at += 1) upgradeStep(held, device, frame(true));
    expect(initTexture).not.toHaveBeenCalled();
    expect(setEarthMaps).not.toHaveBeenCalled();
    for (let at = 0; at < 3; at += 1) upgradeStep(held, device, frame(false));
    expect(initTexture).toHaveBeenCalledTimes(3);
    expect(setEarthMaps).not.toHaveBeenCalled();
    expect(settleFull).not.toHaveBeenCalled();
    upgradeStep(held, device, frame(false));
    expect(setEarthMaps).toHaveBeenCalledWith(full, 0);
    expect(held.upgraded).toBe(true);
  });

  // Alexis on v0.1.8 in Firefox: "on voit bien une mise à jour de texture en cours de route, pas belle". The full maps came after the Earth
  // was made from the half-size ones, and swapping them in sharpened it in one frame.
  it("brings the full set into focus over the half one for a second, never in one frame, then frees the half one", () => {
    const full = fullSet();
    const settleFull = vi.fn();
    const maps = { fullEarth: () => full, fullCame: full, settleFull } as unknown as Maps;
    const setEarthMaps = vi.fn();
    const held = { upgraded: false, drawn: { setEarthMaps, group: new Group() } } as unknown as Held;
    const device = { maps, renderer: gpu() as unknown as WebGLRenderer };
    for (let at = 0; at < 3; at += 1) expect(upgradeStep(held, device, frame(false))).toBe(false);
    expect(upgradeStep(held, device, frame(false))).toBe(true);
    expect(setEarthMaps).toHaveBeenLastCalledWith(full, 0);
    const seen = [0];
    // A flight or a map sent holds the swap, never the focus.
    for (let at = 1; at <= 80; at += 1) {
      const focusing = upgradeStep(held, device, frame(at % 3 === 0));
      const share = setEarthMaps.mock.lastCall?.[1] as number;
      seen.push(share);
      expect(focusing).toBe(share < 1);
      expect(settleFull).toHaveBeenCalledTimes(share < 1 ? 0 : 1);
    }
    expect(seen.at(-1)).toBe(1);
    expect(seen.findIndex((share) => share === 1)).toBeGreaterThanOrEqual(FOCUS_S * 60 - 1);
    // Never a frame's jump: a sixtieth of a second moves it a thirtieth at most, never back.
    for (let at = 1; at < seen.length; at += 1) {
      const change = (seen[at] ?? 0) - (seen[at - 1] ?? 0);
      expect(change).toBeGreaterThanOrEqual(0);
      expect(change).toBeLessThanOrEqual(1 / 30);
    }
    expect(FOCUS_S).toBeGreaterThanOrEqual(0.8);
  });

  it("brings it in at once where motion is reduced", () => {
    const full = fullSet();
    const maps = { fullEarth: () => full, fullCame: full, settleFull: vi.fn() } as unknown as Maps;
    const setEarthMaps = vi.fn();
    const held = { upgraded: false, drawn: { setEarthMaps, group: new Group() } } as unknown as Held;
    const device = { maps, renderer: gpu() as unknown as WebGLRenderer };
    for (let at = 0; at < 4; at += 1) upgradeStep(held, device, frame(false, true));
    expect(upgradeStep(held, device, frame(false, true))).toBe(false);
    expect(setEarthMaps).toHaveBeenLastCalledWith(full, 1);
  });

  it("brings no focus to an Earth made from the full set already", () => {
    const full = fullSet();
    const group = new Group().add(
      new Mesh(undefined, new ShaderMaterial({ uniforms: { surface: { value: full.day } } })),
    );
    const settleFull = vi.fn();
    const maps = { fullEarth: () => full, fullCame: full, settleFull } as unknown as Maps;
    const setEarthMaps = vi.fn();
    const held = { upgraded: false, drawn: { setEarthMaps, group } } as unknown as Held;
    const device = { maps, renderer: gpu() as unknown as WebGLRenderer };
    for (let at = 0; at < 3; at += 1) upgradeStep(held, device, frame(false));
    expect(upgradeStep(held, device, frame(false))).toBe(false);
    expect(setEarthMaps).toHaveBeenLastCalledWith(full);
    expect(settleFull).toHaveBeenCalledTimes(1);
  });
});

import { describe, expect, it } from "vitest";
import { groundDirection } from "@gnoworld/core";
import { Vector3 } from "three";
import { LOOKUP } from "../planet/chunks.ts";
import { EARTH, GROUND_TO_MAP, MOON } from "./look.ts";

// Where an equirectangular map takes a direction: the lookup the surface's shader makes (planet/chunks.ts), to a longitude.
const longitudeOnMap = (direction: readonly [number, number, number]) => {
  const { x, z } = new Vector3(...direction).applyMatrix3(GROUND_TO_MAP);
  return Math.atan2(z, x);
};

describe("the Earth", () => {
  it("is drawn as it is: its map is never warped or recoloured", () => {
    expect(EARTH.warp.amount).toBe(0);
    expect(EARTH.recolour).toBe(0);
  });

  it("wears an atmosphere and the clouds, and no ring of its own: the golden one is an orbit", () => {
    expect(EARTH.rim).not.toBeNull();
    expect(EARTH.clouds).toBeGreaterThan(0);
    expect(EARTH.rings).toBeNull();
  });

  it("reads Paris's longitude off the map: the map is not mirrored", () => {
    const paris = (2.35 * Math.PI) / 180;
    expect(longitudeOnMap(groundDirection({ latitude: 0.85, longitude: paris }))).toBeCloseTo(paris, 9);
    const tokyo = (139.7 * Math.PI) / 180;
    expect(longitudeOnMap(groundDirection({ latitude: 0.62, longitude: tokyo }))).toBeCloseTo(tokyo, 9);
    const newYork = (-74 * Math.PI) / 180;
    expect(longitudeOnMap(groundDirection({ latitude: 0.71, longitude: newYork }))).toBeCloseTo(newYork, 9);
  });

  it("holds to the lookup the shader really makes: if 7b changes it, this says so before a mirrored Earth does", () => {
    expect(LOOKUP).toContain("atan(direction.z, direction.x) / TAU + 0.5");
    expect(LOOKUP).toContain("acos(clamp(direction.y, -1.0, 1.0)) / PI");
  });

  it("keeps the north at the top of the map", () => {
    const { y } = new Vector3(0, 1, 0).applyMatrix3(GROUND_TO_MAP);
    expect(y).toBe(1);
  });
});

describe("the Moon", () => {
  it("is the real one: its own map, no air, no clouds", () => {
    expect(MOON.map).toBe("moon");
    expect(MOON.warp.amount).toBe(0);
    expect(MOON.recolour).toBe(0);
    expect(MOON.rim).toBeNull();
    expect(MOON.clouds).toBe(0);
  });
});

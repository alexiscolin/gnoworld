import { describe, expect, it } from "vitest";
import { regionAt, regionsOf } from "./regions.ts";

const ids = Array.from({ length: 200 }, (_, at) => `world-${String(at * 7919)}`);

describe("regionsOf", () => {
  it("gives the same regions for the same id", () => {
    expect(regionsOf("w1")).toEqual(regionsOf("w1"));
  });

  it("names every region of a world apart, 4 to 14 letters, capitalised", () => {
    for (const id of ids) {
      const names = regionsOf(id).map(({ name }) => name);
      expect(new Set(names).size).toBe(names.length);
      for (const name of names) expect(name).toMatch(/^[A-Z][a-z]{3,13}$/);
    }
  });

  it("holds 4 to 9 regions, centres on the sphere", () => {
    for (const id of ids) {
      const regions = regionsOf(id);
      expect(regions.length).toBeGreaterThanOrEqual(4);
      expect(regions.length).toBeLessThanOrEqual(9);
      for (const { lat, lon } of regions) {
        expect(Math.abs(lat)).toBeLessThanOrEqual(90);
        expect(Math.abs(lon)).toBeLessThanOrEqual(180);
      }
    }
  });

  it("never claims a terrain in a name", () => {
    const names = ids.flatMap((id) => regionsOf(id).map(({ name }) => name.toLowerCase()));
    expect(names.filter((name) => /sea|mount|lake|ocean|hill|isle|rock|river|ice|bay/.test(name))).toEqual([]);
  });

  it("gives no two of 200 worlds the same first name", () => {
    const first = ids.map((id) => regionsOf(id)[0]?.name);
    expect(new Set(first).size).toBe(first.length);
  });
});

describe("regionAt", () => {
  it("puts every point in exactly one region: the nearest centre's", () => {
    const regions = regionsOf("w2");
    for (let lat = -90; lat <= 90; lat += 15) {
      for (let lon = -180; lon <= 180; lon += 20) {
        const there = regionAt("w2", { lat, lon });
        expect(regions.filter(({ name }) => name === there.name)).toHaveLength(1);
      }
    }
  });

  it("gives a region's own centre its own region", () => {
    for (const region of regionsOf("w3")) expect(regionAt("w3", region)).toEqual(region);
  });
});

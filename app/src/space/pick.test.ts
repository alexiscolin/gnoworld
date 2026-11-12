import { describe, expect, it } from "vitest";
import { pickAt } from "./pick.ts";

// Everything stands at the aim, a system a thousand pixels across, so its planets are apart.
const seen = {
  project: (_: unknown, out: { x: number; y: number }) => ((out.x = 5), (out.y = 5), true),
  pixels: () => 1000,
};
const system = {
  place: { x: 0, y: 0, z: 0 },
  across: { x: 1, y: 0, z: 0 },
  along: { x: 0, y: 0, z: 1 },
  reach: 10,
  core: 1,
  planets: [] as unknown[],
};
system.planets.push({ id: "w", radius: 1, orbit: 0, phase: 0, speed: 0, system, hit: { planet: "w" } });
const universe = { systems: [system] } as never;
const aim = { x: 5, y: 5 };

describe("pickAt", () => {
  it("aims at a sun alone from the galaxy, its planets drawn nowhere", () => {
    expect(pickAt(universe, aim, { seen: seen as never, seconds: 0, open: undefined })).toEqual({ system });
  });

  it("aims at a planet of the open system", () => {
    expect(pickAt(universe, aim, { seen: seen as never, seconds: 0, open: system as never })).toEqual({
      planet: expect.objectContaining({ id: "w" }) as unknown,
    });
  });
});

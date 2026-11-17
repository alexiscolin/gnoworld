import { EARTH } from "@gnoworld/core";
import { SphereGeometry, type BufferGeometry } from "three";
import { describe, expect, it, vi } from "vitest";
import type { Planet } from "../layout.ts";
import { colonyCame } from "../colony/load.ts";
import { drawnOf } from "./draw.ts";
import type { Maps } from "./maps.ts";

vi.mock("../earth/earth.ts", () => ({ earthPlanet: (maps: object) => ({ maps }) }));

const planet = (id: string) => ({ id }) as Planet;

describe("a world drawn as itself", () => {
  // The colony's code is a chunk of its own, asked the first time it is drawn near: never with a first screen (D13746).
  it("gives gnosh's colony its own body, none till its code came, and asks no map of it", async () => {
    const setOf = vi.fn(() => undefined);
    const maps = { setOf, earth: vi.fn(() => undefined) } as unknown as Maps;
    const sphere = new SphereGeometry();
    expect(drawnOf(planet("gnosh-ai"), maps, { sphere, page: true })).toBeUndefined();
    await colonyCame();
    const drawn = drawnOf(planet("gnosh-ai"), maps, { sphere, page: true });
    expect(drawn?.group.getObjectByName("colony")).toBeDefined();
    expect(setOf).not.toHaveBeenCalled();
  });

  it("gives any other world its maps' planet, as before", () => {
    const setOf = vi.fn(() => undefined);
    const maps = { setOf, earth: vi.fn(() => undefined) } as unknown as Maps;
    expect(drawnOf(planet("leon"), maps, { sphere: new SphereGeometry(), page: false })).toBeUndefined();
    expect(setOf).toHaveBeenCalledOnce();
  });
});

const HALF = { day: "day 2048", night: "night 2048", clouds: "clouds 2048", moon: "moon" };
const FULL = { day: "day 4096", night: "night 4096", clouds: "clouds 4096" };
const earthWith = (full: typeof FULL | undefined) =>
  // A fake with no fullEarth: making the Earth only reads the full maps, and asks none (a world's page made it ahead and fetched 2.5 MB).
  drawnOf(planet(EARTH), { earth: () => HALF, fullCame: full } as unknown as Maps, {
    sphere: {} as BufferGeometry,
    page: true,
  });

describe("drawnOf, the Earth", () => {
  it("is made from its full maps once they came: no swap is left for its dive (Alexis saw it pop mid-dive)", () => {
    expect(earthWith(FULL)).toEqual({ maps: { ...HALF, ...FULL } });
  });

  it("is made from its half ones while the full ones are on their way", () => {
    expect(earthWith(undefined)).toEqual({ maps: HALF });
  });
});

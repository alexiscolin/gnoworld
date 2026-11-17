import { SphereGeometry } from "three";
import { describe, expect, it, vi } from "vitest";
import type { Planet } from "../layout.ts";
import { colonyCame } from "../colony/load.ts";
import { drawnOf } from "./draw.ts";
import type { Maps } from "./maps.ts";

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

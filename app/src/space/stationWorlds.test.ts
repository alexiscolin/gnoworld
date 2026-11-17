import { describe, expect, it } from "vitest";
import { layoutOf } from "./layout.ts";
import { STATION_WORLDS } from "./stationWorlds.ts";

describe("gnosh's colony in the universe", () => {
  it("is the one station the scene lays out, in gno.land's namespace", () => {
    expect(STATION_WORLDS).toEqual([{ id: "gnosh-ai", namespace: "gnoland", realms: [] }]);
  });

  it("stands in the home system, on an orbit of its own past the Earth's, its body clear of the Earth's (D13743)", () => {
    const universe = layoutOf([], STATION_WORLDS);
    const colony = universe.byId.get("gnosh-ai");
    expect(colony?.system).toBe(universe.home);
    expect((colony?.orbit ?? 0) - (colony?.radius ?? 0)).toBeGreaterThan(universe.earth.orbit + universe.earth.radius);
  });

  it("takes the same orbit whatever the file holds of other systems", () => {
    const alone = layoutOf([], STATION_WORLDS).byId.get("gnosh-ai")?.orbit;
    const other = layoutOf([{ id: "leon", namespace: "leon", realms: [] }], STATION_WORLDS).byId.get("gnosh-ai")?.orbit;
    expect(other).toBe(alone);
  });

  it("stands past gno.land's own worlds and moves none of them", () => {
    const realms = [
      { id: "gov/dao", namespace: "gov", realms: [{ callers: 40 }] },
      { id: "gnoland/blog", namespace: "gnoland", realms: [{ callers: 12 }] },
      { id: "sys/users", namespace: "sys", realms: [{ callers: 90 }] },
    ];
    const without = layoutOf(realms);
    const universe = layoutOf(realms, STATION_WORLDS);
    const colony = universe.byId.get("gnosh-ai");
    expect(colony?.system).toBe(universe.home);
    for (const { id } of realms) {
      const planet = universe.byId.get(id);
      expect(planet?.orbit, id).toBe(without.byId.get(id)?.orbit);
      expect((colony?.orbit ?? 0) - (colony?.radius ?? 0), id).toBeGreaterThan((planet?.orbit ?? 0) + (planet?.radius ?? 0));
    }
  });
});

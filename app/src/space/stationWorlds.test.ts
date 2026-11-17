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
});

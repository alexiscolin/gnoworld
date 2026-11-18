import { describe, expect, it } from "vitest";
import { layoutOf, type Planet, type Universe } from "./layout.ts";
import { readFileSync } from "node:fs";
import { Hubs } from "@gnoworld/schemas";
import { HUB_WORLDS, STATION_WORLDS } from "./stationWorlds.ts";

// A planet of `universe` by its id, which must stand in it; and how far its body reaches from its sun, and starts.
const planetOf = (universe: Universe, id: string): Planet => {
  const planet = universe.byId.get(id);
  if (planet === undefined) throw new Error(`no ${id} in the universe`);
  return planet;
};
const outer = ({ orbit, radius }: Planet) => orbit + radius;
const inner = ({ orbit, radius }: Planet) => orbit - radius;

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

  // Its orbit is out where the system's view looks from inside: it stands still on it, as the Earth does, right of the sun as the preview
  // has it, so that view always holds it; it turns on its own spine (D13747).
  it("stands still on its orbit, as the Earth does, at its own place", () => {
    const universe = layoutOf([], STATION_WORLDS);
    const colony = planetOf(universe, "gnosh-ai");
    expect(colony.speed).toBe(0);
    expect(colony.phase).toBeCloseTo(universe.earth.phase - 1.7, 6);
  });

  // As large as a small planet of the system, read from far (the preview's size): not sized by its use, as a world is.
  it("stands as large as a small planet, near the Earth's size", () => {
    const universe = layoutOf([], STATION_WORLDS);
    expect(planetOf(universe, "gnosh-ai").radius / universe.earth.radius).toBeCloseTo(0.9, 6);
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
    const colony = planetOf(universe, "gnosh-ai");
    expect(colony.system).toBe(universe.home);
    for (const { id } of realms) {
      const planet = planetOf(universe, id);
      expect(planet.orbit, id).toBe(planetOf(without, id).orbit);
      expect(inner(colony), id).toBeGreaterThan(outer(planet));
    }
  });
});

// A hub that lists no realm is in no worlds file (the server's worlds job reads realms), so a flight to its page would lay the universe
// again in its first frame (75 to 109 ms): the scene lays each such hub out from the start.
describe("the hubs that list no realm", () => {
  it("are all laid out from the start, each a system of its own, and no other", () => {
    const hubs = Hubs.parse(JSON.parse(readFileSync("app/data/hubs.json", "utf8")));
    // A station is no planet: it stands round the Earth, or is the colony above.
    const bare = hubs
      .filter(({ kind, realms }) => kind !== "station" && (realms ?? []).length === 0)
      .map(({ slug }) => slug);
    expect(HUB_WORLDS.map(({ id }) => id)).toEqual(bare);
    for (const world of HUB_WORLDS) expect(world).toEqual({ id: world.id, namespace: world.id, realms: [] });
  });

  it("stand in the universe as a planet, so a page asking for one adds nothing", () => {
    const universe = layoutOf([], [...STATION_WORLDS, ...HUB_WORLDS]);
    for (const { id } of HUB_WORLDS) expect(universe.byId.get(id)?.id).toBe(id);
  });
});

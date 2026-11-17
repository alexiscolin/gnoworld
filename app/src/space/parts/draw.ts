// A planet drawn as itself, once its maps came: the Earth the hand-made one, gnosh's colony its own once its code came, every other world
// its recipe.
import { EARTH, SHOWN_STATIONS } from "@gnoworld/core";
import type { BufferGeometry } from "three";
import { colonyBody } from "../colony/load.ts";
import { COLONY_AXIS } from "../stationWorlds.ts";
import { earthPlanet } from "../earth/earth.ts";
import type { Planet } from "../layout.ts";
import { createWorld, mapNamesOf, worldOf } from "../planet/generated.ts";
import type { Planet as Drawn } from "../planet/planet.ts";
import type { Maps } from "./maps.ts";

/** `planet` drawn as itself on `sphere`, or none while its maps are on their way; `page`: it is the page's own, whose maps come first. */
export function drawnOf(
  planet: Planet,
  maps: Maps,
  { sphere, page }: { sphere: BufferGeometry; page: boolean },
): Drawn | undefined {
  if (planet.id === EARTH) {
    const earth = maps.earth(page);
    return earth === undefined ? undefined : earthPlanet(earth, sphere);
  }
  const world = worldOf(planet.id);
  if (SHOWN_STATIONS.includes(planet.id)) return colonyBody({ ...world.look, ...COLONY_AXIS });
  const set = maps.setOf(mapNamesOf(world), page);
  return set === undefined ? undefined : createWorld(world, set, sphere);
}

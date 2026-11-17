// A planet drawn as itself, once its maps came: the Earth the hand-made one, every other world its recipe.
import { EARTH } from "@gnoworld/core";
import type { BufferGeometry } from "three";
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
    // Made from the full maps once they came, it goes to the GPU whole before it shows, no swap left; made ahead, it asks none.
    const full = maps.fullCame;
    return earth === undefined ? undefined : earthPlanet(full === undefined ? earth : { ...earth, ...full }, sphere);
  }
  const world = worldOf(planet.id);
  const set = maps.setOf(mapNamesOf(world), page);
  return set === undefined ? undefined : createWorld(world, set, sphere);
}

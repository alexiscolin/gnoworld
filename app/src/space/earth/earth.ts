// The Earth as the hand-made planet it is (its own look and maps, ADR-0002 §3): the near planets and the portraits draw this one.
import type { BufferGeometry } from "three";
import { createPlanet, LIMB_LIGHT, type Planet } from "../planet/planet.ts";
import { EARTH, GROUND_TO_MAP } from "./look.ts";
import type { EarthMaps } from "./maps.ts";

/** The Earth from its `day`, `clouds` and `night` maps, on `sphere`. */
export function earthPlanet(
  { day, clouds, night }: Pick<EarthMaps, "day" | "clouds" | "night">,
  sphere: BufferGeometry,
): Planet {
  const earth = createPlanet(EARTH, { map: () => day, clouds, ring: clouds, night }, sphere);
  const spin = earth.surface.uniforms["spin"];
  if (spin !== undefined) spin.value = GROUND_TO_MAP;
  earth.setLimb(LIMB_LIGHT);
  return earth;
}

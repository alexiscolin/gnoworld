// The Earth, its one Moon and the golden ring, as one group: what the view stands on the stage. It owns all of it, the maps included.
import { Group, SphereGeometry, Vector3, type Mesh, type Texture } from "three";
import { Disposer } from "../disposer.ts";
import { freeMap } from "../planet/maps.ts";
import { createPlanet, type MapSet, type Planet } from "../planet/planet.ts";
import { EARTH, GROUND_TO_MAP, MOON } from "./look.ts";
import type { EarthMaps } from "./maps.ts";
import { createOrbit, type Orbit } from "./orbit.ts";

const SPHERE_WIDTH = 160;
const SPHERE_HEIGHT = 120;
const MOON_RADIUS = 0.085;
const LIMB = 1.05;

export class Globe {
  readonly #owner = new Disposer();
  readonly #orbit: Orbit & { readonly glow: Mesh };
  readonly #moonAt = new Vector3();
  readonly group = new Group();
  readonly earth: Planet;
  readonly moon: Planet;
  readonly mapWidth: number;

  constructor(maps: EarthMaps) {
    for (const map of Object.values(maps))
      this.#owner.add({
        dispose: () => {
          freeMap(map as Texture);
        },
      });
    this.mapWidth = (maps.day.image as { width: number }).width;
    const sphere = this.#owner.add(new SphereGeometry(1, SPHERE_WIDTH, SPHERE_HEIGHT));
    const { clouds } = maps;
    this.earth = this.#owner.add(createPlanet(EARTH, this.#set(maps.day, clouds, maps.night), sphere));
    this.earth.setLimb(LIMB);
    const spin = this.earth.surface.uniforms["spin"];
    if (spin !== undefined) spin.value = GROUND_TO_MAP;
    this.moon = this.#owner.add(createPlanet(MOON, this.#set(maps.moon, clouds), sphere));
    this.moon.group.scale.setScalar(MOON_RADIUS);
    const spinMoon = this.moon.surface.uniforms["spin"];
    if (spinMoon !== undefined) spinMoon.value = GROUND_TO_MAP;
    this.#orbit = this.#owner.add(createOrbit());
    this.group.add(this.earth.group, this.#orbit.group, this.moon.group, this.#orbit.glow);
  }

  // One surface a set: no ring is drawn here, and the shader never reads what the flag keeps shut.
  #set(surface: Texture, clouds: Texture, night?: Texture): MapSet {
    return { map: () => surface, clouds, ring: clouds, ...(night === undefined ? {} : { night }) };
  }

  /** Puts the Moon at `angle` on its orbit, and the ring's wake behind it. */
  setMoon(angle: number): void {
    this.#orbit.moonAt(angle, this.#moonAt);
    this.moon.group.position.copy(this.#moonAt);
    this.#orbit.glow.position.copy(this.#moonAt);
    this.#orbit.setHead(angle);
  }

  /** The orbit's point at `angle`, in the group's space. */
  orbitAt(angle: number): Vector3 {
    return this.#orbit.moonAt(angle);
  }

  dispose(): void {
    this.group.removeFromParent();
    this.#owner.dispose();
  }
}

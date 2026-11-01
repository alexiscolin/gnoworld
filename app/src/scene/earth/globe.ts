// The Earth, its one Moon and the golden ring, as one group: what the view stands on the stage. It owns all of it, the maps included.
import { Group, SphereGeometry, Vector3, type Mesh, type Texture } from "three";
import { Disposer } from "../disposer.ts";
import { freeMap } from "../planet/maps.ts";
import { createPlanet, type MapSet, type Planet } from "../planet/planet.ts";
import { SPIN } from "../planet/surfaceShader.ts";
import { Ground } from "./ground.ts";
import { EARTH, GROUND_TO_MAP, MOON } from "./look.ts";
import { loadEarthMaps, type EarthMaps } from "./maps.ts";
import { createOrbit, type Orbit } from "./orbit.ts";
import type { EarthDevice } from "./view.ts";

const SPHERE_WIDTH = 160;
const SPHERE_HEIGHT = 120;
const MOON_RADIUS = 0.085;
const LIMB = 1.05;
const POLE = new Vector3(0, 1, 0);
const ANISOTROPY = 8;

export class Globe {
  readonly #owner = new Disposer();
  readonly #orbit: Orbit & { readonly glow: Mesh };
  readonly #moonAt = new Vector3();
  readonly #noon = new Vector3();
  readonly #sun = new Vector3();
  readonly #earth: Planet;
  readonly moon: Planet;
  readonly ground: Ground;
  readonly group = new Group();
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
    this.#earth = this.#owner.add(createPlanet(EARTH, this.#set(maps.day, clouds, maps.night), sphere));
    this.#earth.setLimb(LIMB);
    this.moon = this.#owner.add(createPlanet(MOON, this.#set(maps.moon, clouds), sphere));
    this.moon.group.scale.setScalar(MOON_RADIUS);
    for (const { surface } of [this.#earth, this.moon])
      if (surface.uniforms["spin"] !== undefined) surface.uniforms["spin"].value = GROUND_TO_MAP;
    this.#orbit = this.#owner.add(createOrbit());
    this.ground = this.#owner.add(new Ground());
    this.group.add(this.ground.mesh, this.#earth.group, this.#orbit.group, this.moon.group, this.#orbit.glow);
  }

  // One surface a set: no ring is drawn here, and the shader never reads what the flag keeps shut.
  #set(surface: Texture, clouds: Texture, night?: Texture): MapSet {
    return { map: () => surface, clouds, ring: clouds, ...(night === undefined ? {} : { night }) };
  }

  /** The real sun's height over the equator, in radians, kept for every `setSun`. */
  aim(latitude: number): void {
    this.#noon.set(Math.cos(latitude), Math.sin(latitude), 0);
  }

  /** Stands the sun at `azimuth` round the pole, in the ground's sense, past the Earth's lean. */
  setSun(azimuth: number): void {
    this.#sun.copy(this.#noon).applyAxisAngle(POLE, azimuth).applyEuler(this.#earth.group.rotation);
    this.#earth.setSun(this.#sun);
    this.moon.setSun(this.#sun);
  }

  /** Turns the ground by `turn` radians. */
  setTurn(turn: number): void {
    this.#earth.setTime(turn / SPIN);
  }

  /** Puts the Moon at `angle` on its orbit, and the ring's wake behind it. */
  setMoon(angle: number): void {
    this.#orbit.moonAt(angle, this.#moonAt);
    this.moon.group.position.copy(this.#moonAt);
    // In front of the Moon, so its halo lifts the dark side a little: a black half would read as a hole in the light.
    this.#orbit.glow.position.copy(this.#moonAt).setZ(this.#moonAt.z + MOON_RADIUS);
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

const nextTask = () =>
  new Promise((done) => {
    setTimeout(done);
  });

/** Loads and builds the globe, nothing of it reaching the first frame unfinished; or nothing, once `stale` says the page has gone. Each upload
 * has a task of its own: the mipmaps of a 4096 map are the longest thing this page does. */
export async function buildGlobe(device: EarthDevice, stale: () => boolean): Promise<Globe | undefined> {
  const { renderer, camera, stage, base, halved } = device;
  const anisotropy = Math.min(renderer.capabilities.getMaxAnisotropy(), ANISOTROPY);
  const maps = await loadEarthMaps(base, anisotropy, halved());
  const globe = new Globe(maps);
  try {
    for (const map of Object.values(maps)) {
      if (!stale()) renderer.initTexture(map as Texture);
      await nextTask();
    }
    if (!stale()) await renderer.compileAsync(globe.group, camera, stage);
  } catch (error) {
    globe.dispose();
    throw error;
  }
  if (!stale()) return globe;
  globe.dispose();
  return undefined;
}

// The Earth, its one Moon and the golden ring, as one group: what the view stands on the stage. It owns all of it, the maps included.
import {
  Group,
  SphereGeometry,
  Vector3,
  type BufferGeometry,
  type Euler,
  type Mesh,
  type Object3D,
  type Texture,
} from "three";
import { Disposer } from "../disposer.ts";
import { starAt } from "../planet/light.ts";
import { freeMap } from "../planet/maps.ts";
import { createPlanet, LIMB_LIGHT, type HandMade, type Planet } from "../planet/planet.ts";
import { SPIN } from "../planet/surfaceShader.ts";
import { Ground } from "./ground.ts";
import { EARTH, GROUND_TO_MAP, MOON } from "./look.ts";
import { loadEarthMaps, type EarthMaps } from "./maps.ts";
import { createOrbit, type Orbit } from "./orbit.ts";
import type { EarthDevice } from "./device.ts";

const SPHERE_WIDTH = 160;
const SPHERE_HEIGHT = 120;
const MOON_RADIUS = 0.085;
// Frame 4's Moon, 13 pixels on a 47-pixel Earth: its own size would be two pixels at this distance.
const FAR_MOON_RADIUS = 0.27;
const ANISOTROPY = 16;

// The Earth or its Moon on its own map, turned as the ground is. One surface a set: no ring is drawn here, and the shader never reads what
// the flag keeps shut.
function handMade(look: HandMade, { surface, clouds, night }: HandMaps, sphere: BufferGeometry): Planet {
  const planet = createPlanet(
    look,
    { map: () => surface, clouds, ring: clouds, ...(night === undefined ? {} : { night }) },
    sphere,
  );
  const spin = planet.surface.uniforms["spin"];
  if (spin !== undefined) spin.value = GROUND_TO_MAP;
  return planet;
}

interface HandMaps {
  readonly surface: Texture;
  readonly clouds: Texture;
  readonly night?: Texture;
}

// The Earth on its day, night and clouds, its rim lit by hand.
function earthPlanet(
  { day, clouds, night }: Pick<EarthMaps, "day" | "clouds" | "night">,
  sphere: BufferGeometry,
): Planet {
  const earth = handMade(EARTH, { surface: day, clouds, night }, sphere);
  earth.setLimb(LIMB_LIGHT);
  return earth;
}

export class Globe {
  readonly #owner = new Disposer();
  readonly #orbit: Orbit & { readonly glow: Mesh };
  readonly #moonAt = new Vector3();
  readonly #sun = new Vector3();
  #latitude = 0;
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
    this.#earth = this.#owner.add(earthPlanet(maps, sphere));
    this.moon = this.#owner.add(handMade(MOON, { surface: maps.moon, clouds }, sphere));
    this.moon.group.scale.setScalar(MOON_RADIUS);
    this.#orbit = this.#owner.add(createOrbit());
    this.ground = this.#owner.add(new Ground());
    this.group.add(this.ground.mesh, this.#earth.group, this.#orbit.group, this.moon.group, this.#orbit.glow);
  }

  /** The Earth's lean, which every point of its ground takes. */
  get lean(): Euler {
    return this.#earth.group.rotation;
  }

  /** Leans the pole towards the eye by `lean` radians, for the next `setSun`. */
  setLean(lean: number): void {
    this.#earth.group.rotation.x = lean;
  }

  /** The real sun's height over the equator, in radians, kept for every `setSun`. */
  aim(latitude: number): void {
    this.#latitude = latitude;
  }

  /** Stands the sun at `azimuth` round the pole, in the ground's sense, past the Earth's lean and the globe's own turn. */
  setSun(azimuth: number): void {
    starAt(this.#latitude, azimuth, this.#sun)
      .applyEuler(this.#earth.group.rotation)
      .applyQuaternion(this.group.quaternion);
    this.#earth.setSun(this.#sun);
    this.moon.setSun(this.#sun);
  }

  /** Turns the ground by `turn` radians, the clouds drifting over it by `drift`: the eye's turn is no wind. */
  setTurn(turn: number, drift: number): void {
    this.#earth.setTime(turn / SPIN, drift / SPIN);
  }

  /** Puts the Moon at `angle` on its orbit, and the ring's wake behind it. */
  setMoon(angle: number): void {
    this.#orbit.moonAt(angle, this.#moonAt);
    this.moon.group.position.copy(this.#moonAt);
    // In front of the Moon, so its halo lifts the dark side a little: a black half would read as a hole in the light.
    this.#orbit.glow.position.copy(this.#moonAt).setZ(this.#moonAt.z + MOON_RADIUS);
    this.#orbit.setHead(angle);
  }

  /** For an Earth of `radius` world units, seen small among the worlds: `line`, of the orbit's radius, for its ring. */
  stand(radius: number, line: Object3D): void {
    this.group.scale.setScalar(radius);
    this.moon.group.scale.setScalar(FAR_MOON_RADIUS);
    this.#orbit.setFine(line);
  }

  /** The orbit's point at `angle`, in the group's space. */
  orbitAt(angle: number): Vector3 {
    return this.#orbit.moonAt(angle, new Vector3());
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

/** Loads and builds the globe, nothing of it reaching the first frame unfinished; or nothing, once `signal` says the page has gone. Each
 * upload has a task of its own: the mipmaps of a 4096 map are the longest thing this page does. */
export async function buildGlobe(device: EarthDevice, signal: AbortSignal): Promise<Globe | undefined> {
  const { renderer, camera, stage, base, halved } = device;
  const anisotropy = Math.min(renderer.capabilities.getMaxAnisotropy(), ANISOTROPY);
  const maps = await loadEarthMaps(base, { anisotropy, halved: halved(), signal });
  const globe = new Globe(maps);
  try {
    for (const map of Object.values(maps)) {
      if (!signal.aborted) renderer.initTexture(map as Texture);
      await nextTask();
    }
    if (!signal.aborted) await renderer.compileAsync(globe.group, camera, stage);
  } catch (error) {
    globe.dispose();
    throw error;
  }
  if (!signal.aborted) return globe;
  globe.dispose();
  return undefined;
}

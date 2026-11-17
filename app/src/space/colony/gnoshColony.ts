// gnosh's colony as the scene draws a planet as itself (planet/planet.ts): placed, scaled and turned by the view, turning about its spine on
// the ground's clock so its signs ride with it, lit by its system's sun with shadows. A chunk of its own (load.ts). Nothing made on a frame.
import type { PlanetLook } from "@gnoworld/core";
import { DirectionalLight, Group, Quaternion, ShaderMaterial, type Vector3 } from "three";
import type { Hull } from "../earth/groundTypes.ts";
import type { Planet as Drawn } from "../planet/planet.ts";
import { kept } from "../earth/light.ts";
import { SPIN } from "../planet/surfaceShader.ts";
import { colonyOf, type Colony } from "./colony.ts";

// raw: the sun's light on the hull, as the planets' (planet.ts), and how far up its light stands, in the colony's radii
const SUN = 3.2;
const LIGHT_AT = 6;
// raw: the shadows' box round the colony, in its radii (its spine reaches 1.3), and their map's side
const SHADOW = { box: 1.7, map: 2048 } as const;
// What a world does that the colony has no part for.
const none = (): void => undefined;

/** The colony drawn as a world is, its hull handed to the page's signs. */
export class ColonyBody implements Drawn {
  readonly look: PlanetLook;
  readonly group = new Group();
  readonly surface = new ShaderMaterial();
  readonly hull: Hull;
  readonly #colony: Colony;
  readonly #lamp = new DirectionalLight(0xfff3e2, SUN);
  readonly #back = new Quaternion();
  #size = 0;

  constructor(look: PlanetLook) {
    this.look = look;
    // Stood on its axis as a planet is (planet.ts); a view on a page turns it by its look again.
    this.group.rotation.set(look.lean, 0, look.tilt);
    this.#colony = colonyOf();
    this.hull = this.#colony;
    const lamp = this.#lamp;
    lamp.castShadow = true;
    lamp.shadow.mapSize.set(SHADOW.map, SHADOW.map);
    lamp.shadow.bias = -0.0004;
    lamp.shadow.normalBias = 0.02;
    lamp.target = this.#colony.group;
    this.group.add(this.#colony.group, lamp);
  }

  setSun(direction: Vector3): void {
    // The light stands sunward of the colony, in its group's frame: the group is turned by the view, the sun is not.
    this.#back.copy(this.group.quaternion).invert();
    this.#lamp.position.copy(direction).applyQuaternion(this.#back).multiplyScalar(LIGHT_AT);
    const size = this.group.scale.x;
    if (size === this.#size) return;
    this.#size = size;
    const { camera } = this.#lamp.shadow;
    const box = SHADOW.box * size;
    [camera.left, camera.right, camera.top, camera.bottom] = [-box, box, box, -box];
    [camera.near, camera.far] = [0.1 * size, 2 * LIGHT_AT * size];
    camera.updateProjectionMatrix();
  }

  setTime(seconds: number): void {
    // The ground's own turn, the Earth's kept day with it (earth/ground.ts turns a mark by the same): the spine is the pole.
    this.#colony.spin.rotation.y = -(seconds * SPIN + kept());
  }

  // A world's surface, air, moons, maps and lights: the colony has none of them; its hull is lit by its own lamp.
  readonly setHeight = none;
  readonly setMoons = none;
  readonly setEarthMaps = none;
  readonly setArrive = none;
  readonly setDepth = none;
  readonly setLimb = none;
  readonly setFar = none;
  readonly setClose = none;
  readonly setPlate = none;
  readonly setSigns = none;

  dispose(): void {
    this.#colony.dispose();
    this.#lamp.dispose();
    this.surface.dispose();
  }
}

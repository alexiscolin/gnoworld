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
// raw: the shadows' box round the colony, in its radii (its mirror petals reach 1.76), and their map's side
const SHADOW = { box: 1.8, map: 1024 } as const;
// raw: its size framed close on its page, a share of its sphere's (the preview's), and the share of the way it eases there each frame
const PAGE = 0.6;
const EASE = 0.06;
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
  #close = 0;

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
    // Far, its light level casts nothing: its shadows are drawn again only near.
    this.#lamp.shadow.autoUpdate = this.#colony.lod.getCurrentLevel() === 0;
    const size = this.group.scale.x;
    if (size === this.#size) return;
    this.#size = size;
    const { camera } = this.#lamp.shadow;
    const box = SHADOW.box * size;
    [camera.left, camera.right, camera.top, camera.bottom] = [-box, box, box, -box];
    [camera.near, camera.far] = [0.1 * size, 2 * LIGHT_AT * size];
    camera.updateProjectionMatrix();
  }

  // Framed close on its page, it eases down to PAGE of its size, whole in the page's circle, and back as the page goes.
  setClose(share: number): void {
    this.#close += (share - this.#close) * EASE;
    this.#colony.spin.scale.setScalar(1 - (1 - PAGE) * this.#close);
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
  readonly setPlate = none;
  readonly setSigns = none;

  dispose(): void {
    this.#colony.dispose();
    this.#lamp.dispose();
    this.surface.dispose();
  }
}

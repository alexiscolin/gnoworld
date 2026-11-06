// A far belt (ADR-0002 §10): rocks past every orbit, one draw, from a system's name alone. Dark brown and soft, a pixel or two, lit on one
// side, with the glow a quarter through them: no black hole in the light. Points: at this size a rock has no shape to tell, and an instanced
// mesh would bring three's classes into the scene's chunk. Scenery, so nothing here means data.
import { onPlane, ROCKS_FROM, ROOM, type StarSystem } from "@gnoworld/core";
import { ShaderMaterial, type Object3D } from "three";
import type { Disposer } from "../disposer.ts";
import { pointCloud, type Cloud } from "./cloud.ts";

/** A belt's rocks. */
export const ROCKS = 40;
const LEAST_PIXELS = 1.4;
const MORE_PIXELS = 2.2;
const WORD = 2 ** 32;
const THICK = 0.3;

const VERTEX = /* glsl */ `
attribute vec3 aStar;
attribute float aSize;
uniform float uRatio;
varying vec3 vToStar;
void main() {
  vToStar = normalize(mat3(modelViewMatrix) * (aStar - position));
  gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
  gl_PointSize = aSize * uRatio;
}`;

const FRAGMENT = /* glsl */ `
uniform float uFade;
varying vec3 vToStar;
void main() {
  vec2 at = gl_PointCoord * 2.0 - 1.0;
  at.y = -at.y;
  float reach = dot(at, at);
  if (reach >= 1.0) discard;
  float lit = smoothstep(-0.1, 0.9, dot(vec3(at, sqrt(1.0 - reach)), vToStar));
  gl_FragColor = vec4(vec3(0.3, 0.2, 0.13) * (0.3 + 1.4 * lit), 0.75 * (1.0 - reach) * uFade);
  #include <tonemapping_fragment>
  #include <colorspace_fragment>
}`;

// A small stream of a system's own: the same name, the same rocks.
const streamOf = (seed: number) => {
  let state = seed;
  return () => {
    state = (Math.imul(state, 1664525) + 1013904223) >>> 0;
    return state / WORD;
  };
};

export class Belt {
  readonly #cloud: Cloud<"position" | "aStar" | "aSize">;
  readonly #ratio = { value: 1 };
  readonly #at = { x: 0, y: 0, z: 0 };
  readonly #offset = { along: 0, across: 0, up: 0 };
  /** How much of them shows: the whole cosmos takes the rest. */
  readonly fade = { value: 1 };
  #count = 0;

  constructor(parent: Object3D, owner: Disposer, most: number) {
    const material = new ShaderMaterial({
      depthWrite: false,
      transparent: true,
      uniforms: { uRatio: this.#ratio, uFade: this.fade },
      vertexShader: VERTEX,
      fragmentShader: FRAGMENT,
    });
    this.#cloud = pointCloud(parent, owner, { most, items: { position: 3, aStar: 3, aSize: 1 }, material });
  }

  /** How many rocks stand. */
  get count(): number {
    return this.#count;
  }

  resize(ratio: number): void {
    this.#ratio.value = ratio;
  }

  /** Lays `system`'s rocks from rock `first` on, in its own plane, and says where the next go: the same name, the same rocks. */
  lay(system: StarSystem, first: number): number {
    const next = streamOf(Math.round(system.warmth * WORD));
    const { x, y, z } = system.place;
    const { position, aStar, aSize } = this.#cloud.attributes;
    for (let rock = 0; rock < ROCKS; rock += 1) {
      const angle = next() * Math.PI * 2;
      const across = ROCKS_FROM + next() * (ROOM - ROCKS_FROM);
      this.#offset.along = across * Math.cos(angle);
      this.#offset.across = across * Math.sin(angle);
      this.#offset.up = (next() - 0.5) * THICK;
      onPlane(system, this.#offset, this.#at);
      position.setXYZ(first + rock, this.#at.x, this.#at.y, this.#at.z);
      aStar.setXYZ(first + rock, x, y, z);
      aSize.setX(first + rock, LEAST_PIXELS + MORE_PIXELS * next() ** 3);
    }
    return first + ROCKS;
  }

  /** Shows the first `count`. */
  commit(count: number): void {
    this.#count = count;
    this.#cloud.commit(count);
  }
}

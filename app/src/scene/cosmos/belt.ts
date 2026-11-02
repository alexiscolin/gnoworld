// A far belt (ADR-0002 §10): rocks past every orbit, one draw, from a system's name alone. Dark brown and soft, a pixel or two, lit on one
// side, with the glow a quarter through them: no black hole in the light. Points: at this size a rock has no shape to tell, and an instanced
// mesh would bring three's classes into the scene's chunk. Scenery, so nothing here means data.
import { BELT_INNER, ROOM, type StarSystem } from "@gnoworld/core";
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
varying vec3 vToStar;
void main() {
  vec2 at = gl_PointCoord * 2.0 - 1.0;
  at.y = -at.y;
  float reach = dot(at, at);
  if (reach >= 1.0) discard;
  float lit = smoothstep(-0.1, 0.9, dot(vec3(at, sqrt(1.0 - reach)), vToStar));
  gl_FragColor = vec4(vec3(0.3, 0.2, 0.13) * (0.3 + 1.4 * lit), 0.75 * (1.0 - reach));
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
  #count = 0;

  constructor(parent: Object3D, owner: Disposer, most: number) {
    const material = new ShaderMaterial({
      depthWrite: false,
      transparent: true,
      uniforms: { uRatio: this.#ratio },
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

  /** Lays `system`'s rocks from rock `first` on, opened by `spread` as its worlds are, and says where the next go: the same name, the same rocks. */
  lay(system: StarSystem, first: number, spread: number): number {
    const next = streamOf(Math.round(system.warmth * WORD));
    const { x, y, z } = system.place;
    const { position, aStar, aSize } = this.#cloud.attributes;
    for (let rock = 0; rock < ROCKS; rock += 1) {
      const angle = next() * Math.PI * 2;
      const across = spread * (BELT_INNER + next() * (ROOM - BELT_INNER));
      position.setXYZ(
        first + rock,
        x + across * Math.cos(angle),
        y + (next() - 0.5) * THICK,
        z + across * Math.sin(angle),
      );
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

// A far belt (ADR-0002 §10): dark rocks past every orbit, one draw, from a system's name alone. Scenery, so nothing here means data: dust is
// a sign, and it never stands near a world.
import { BELT_INNER, ROOM, type StarSystem } from "@gnoworld/core";
import {
  Euler,
  IcosahedronGeometry,
  InstancedBufferAttribute,
  InstancedMesh,
  Matrix4,
  Quaternion,
  ShaderMaterial,
  Vector3,
  type Object3D,
} from "three";
import type { Disposer } from "../disposer.ts";

/** A belt's rocks. */
export const ROCKS = 40;
const LARGEST = 0.16;
const WORD = 2 ** 32;
const THICK = 0.3;

const VERTEX = /* glsl */ `
attribute vec3 aStar;
varying vec3 vNormal;
varying vec3 vToStar;
void main() {
  mat4 local = modelMatrix * instanceMatrix;
  vec4 world = local * vec4(position, 1.0);
  vNormal = normalize(mat3(local) * position);
  vToStar = normalize((modelMatrix * vec4(aStar, 1.0)).xyz - world.xyz);
  gl_Position = projectionMatrix * viewMatrix * world;
}`;

const FRAGMENT = /* glsl */ `
varying vec3 vNormal;
varying vec3 vToStar;
void main() {
  float lit = smoothstep(-0.1, 0.9, dot(normalize(vNormal), vToStar));
  gl_FragColor = vec4(vec3(0.34, 0.3, 0.27) * (0.012 + lit), 1.0);
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
  readonly #mesh: InstancedMesh<IcosahedronGeometry, ShaderMaterial>;
  readonly #star: InstancedBufferAttribute;
  readonly #matrix = new Matrix4();
  readonly #at = new Vector3();
  readonly #turn = new Quaternion();
  readonly #euler = new Euler();
  readonly #size = new Vector3();

  constructor(parent: Object3D, owner: Disposer, most: number) {
    const geometry = owner.add(new IcosahedronGeometry(1, 1));
    const material = owner.add(new ShaderMaterial({ vertexShader: VERTEX, fragmentShader: FRAGMENT }));
    this.#mesh = new InstancedMesh(geometry, material, most);
    this.#star = new InstancedBufferAttribute(new Float32Array(most * 3), 3);
    geometry.setAttribute("aStar", this.#star);
    this.#mesh.frustumCulled = false;
    this.#mesh.count = 0;
    parent.add(this.#mesh);
    owner.add(this.#mesh);
  }

  /** How many rocks stand. */
  get count(): number {
    return this.#mesh.count;
  }

  /** Lays `system`'s rocks from rock `first` on, opened by `spread` as its worlds are, and says where the next go: the same name, the same rocks. */
  lay(system: StarSystem, first: number, spread: number): number {
    const next = streamOf(Math.round(system.warmth * WORD));
    const { x, y, z } = system.place;
    for (let rock = 0; rock < ROCKS; rock += 1) {
      const angle = next() * Math.PI * 2;
      const across = spread * (BELT_INNER + next() * (ROOM - BELT_INNER));
      this.#at.set(x + across * Math.cos(angle), y + (next() - 0.5) * THICK, z + across * Math.sin(angle));
      this.#turn.setFromEuler(this.#euler.set(next() * 6, next() * 6, next() * 6));
      const size = LARGEST * (0.25 + 0.75 * next() ** 3);
      this.#size.set(size, size * (0.6 + 0.4 * next()), size * (0.6 + 0.4 * next()));
      this.#mesh.setMatrixAt(first + rock, this.#matrix.compose(this.#at, this.#turn, this.#size));
      this.#star.setXYZ(first + rock, x, y, z);
    }
    return first + ROCKS;
  }

  /** Shows the first `count`. */
  commit(count: number): void {
    this.#mesh.count = count;
    this.#mesh.instanceMatrix.needsUpdate = true;
    this.#star.needsUpdate = true;
  }
}

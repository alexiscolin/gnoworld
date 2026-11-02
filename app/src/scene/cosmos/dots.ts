// Worlds from afar: one draw of points around their stars. A point's size and light come from the ladder, written at each look, so no world
// keeps a size as the eye leaves. Its orbit runs in the vertex shader, and it is a clear glint added to the light around it: a crowd reads as
// fine bright grain round its star, never as black dots.
import type { Point } from "@gnoworld/core";
import {
  AdditiveBlending,
  BufferAttribute,
  BufferGeometry,
  DynamicDrawUsage,
  Points,
  ShaderMaterial,
  type Object3D,
} from "three";
import type { Disposer } from "../disposer.ts";

interface DotLook {
  /** Its orbit's radius, its phase, its star's spin. */
  readonly orbit: readonly [number, number, number];
  readonly tint: readonly [number, number, number];
  /** Its radius in pixels, and its light. */
  readonly size: readonly [number, number];
}

// A far body's light, FAR_ANGLE from the eye, on the side its star stands (planet/light.ts).
const VERTEX = /* glsl */ `
const vec2 SIDE = vec2(0.659, 0.752);
attribute vec3 aOrbit;
attribute vec3 aTint;
attribute vec2 aSize;
uniform float uSeconds;
uniform float uRatio;
varying vec3 vTint;
varying float vLight;
varying vec3 vStar;
void main() {
  float angle = aOrbit.y + aOrbit.z * uSeconds;
  vec3 out_ = vec3(cos(angle), 0.0, sin(angle));
  vTint = mix(aTint, vec3(1.0, 0.86, 0.68), 0.45);
  vLight = aSize.y;
  vec2 side = normalize((mat3(modelViewMatrix) * -out_).xy + vec2(1.0e-4, 0.0));
  vStar = vec3(side * SIDE.x, SIDE.y);
  gl_Position = projectionMatrix * modelViewMatrix * vec4(position + out_ * aOrbit.x, 1.0);
  gl_PointSize = 2.0 * aSize.x * uRatio;
}`;

const FRAGMENT = /* glsl */ `
varying vec3 vTint;
varying float vLight;
varying vec3 vStar;
void main() {
  vec2 at = gl_PointCoord * 2.0 - 1.0;
  at.y = -at.y;
  float reach = dot(at, at);
  if (reach >= 1.0) discard;
  vec3 normal = vec3(at, sqrt(1.0 - reach));
  float lit = smoothstep(-0.16, 0.95, dot(normal, vStar));
  gl_FragColor = vec4(vTint * (0.2 + 0.9 * lit) * vLight * (1.0 - smoothstep(0.45, 1.0, reach)), 1.0);
  #include <tonemapping_fragment>
  #include <colorspace_fragment>
}`;

export class Dots {
  readonly #geometry = new BufferGeometry();
  readonly #at: BufferAttribute;
  readonly #orbit: BufferAttribute;
  readonly #tint: BufferAttribute;
  readonly #size: BufferAttribute;
  readonly #seconds = { value: 0 };
  readonly #ratio = { value: 1 };

  constructor(parent: Object3D, owner: Disposer, most: number) {
    const size = (items: number) => {
      const attribute = new BufferAttribute(new Float32Array(most * items), items);
      attribute.setUsage(DynamicDrawUsage);
      return attribute;
    };
    this.#at = size(3);
    this.#orbit = size(3);
    this.#tint = size(3);
    this.#size = size(2);
    this.#geometry.setAttribute("position", this.#at);
    this.#geometry.setAttribute("aOrbit", this.#orbit);
    this.#geometry.setAttribute("aTint", this.#tint);
    this.#geometry.setAttribute("aSize", this.#size);
    this.#geometry.setDrawRange(0, 0);
    const material = new ShaderMaterial({
      blending: AdditiveBlending,
      depthWrite: false,
      transparent: true,
      uniforms: { uSeconds: this.#seconds, uRatio: this.#ratio },
      vertexShader: VERTEX,
      fragmentShader: FRAGMENT,
    });
    const points = new Points(this.#geometry, material);
    points.frustumCulled = false;
    parent.add(points);
    owner.add(this.#geometry);
    owner.add(material);
  }

  resize(ratio: number): void {
    this.#ratio.value = ratio;
  }

  /** The clock their orbits run on. */
  advance(seconds: number): void {
    this.#seconds.value = seconds;
  }

  /** Sets point `index`: around the star at `at`. */
  set(index: number, { x, y, z }: Point, { orbit, tint, size }: DotLook): void {
    this.#at.setXYZ(index, x, y, z);
    this.#orbit.setXYZ(index, ...orbit);
    this.#tint.setXYZ(index, ...tint);
    this.#size.setXY(index, ...size);
  }

  /** Shows the first `count`. */
  commit(count: number): void {
    this.#geometry.setDrawRange(0, count);
    for (const attribute of [this.#at, this.#orbit, this.#tint, this.#size]) attribute.needsUpdate = true;
  }
}

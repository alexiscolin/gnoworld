// Worlds from afar: one draw of points around their stars. A point's size and light come from the ladder, written at each look, so no world
// keeps a size as the eye leaves. Its orbit runs in the vertex shader, and it is a soft glint added to the light around it, so a crowd reads
// as warm dust round its star, never as black dots.
import type { Point } from "@gnoworld/core";
import { AdditiveBlending, ShaderMaterial, type Object3D } from "three";
import type { Disposer } from "../disposer.ts";
import { pointCloud, type Cloud } from "./cloud.ts";

interface DotLook {
  /** Its orbit's radius, its phase, its star's spin. */
  readonly orbit: readonly [number, number, number];
  readonly tint: readonly [number, number, number];
  /** Its radius in pixels, and its light. */
  readonly size: readonly [number, number];
}

/** Which way a world stands from its star, its orbit's radius, phase and its star's spin given: the one place a world's point and its
 * lines take it, at any distance (GLSL). */
const ORBITING = /* glsl */ `
vec3 orbiting(vec3 orbit, float seconds) {
  float angle = orbit.y + orbit.z * seconds;
  return vec3(cos(angle), 0.0, sin(angle));
}`;

// A far body's light, FAR_ANGLE from the eye, on the side its star stands (planet/light.ts).
const VERTEX = /* glsl */ `
const vec2 SIDE = vec2(0.906, 0.423);
attribute vec3 aOrbit;
attribute vec3 aTint;
attribute vec2 aSize;
uniform float uSeconds;
uniform float uRatio;
varying vec3 vTint;
varying float vLight;
varying vec3 vStar;
${ORBITING}
void main() {
  vec3 out_ = orbiting(aOrbit, uSeconds);
  vTint = aTint;
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
  readonly #cloud: Cloud<"position" | "aOrbit" | "aTint" | "aSize">;
  readonly #seconds = { value: 0 };
  readonly #ratio = { value: 1 };

  constructor(parent: Object3D, owner: Disposer, most: number) {
    const material = new ShaderMaterial({
      blending: AdditiveBlending,
      depthWrite: false,
      transparent: true,
      uniforms: { uSeconds: this.#seconds, uRatio: this.#ratio },
      vertexShader: VERTEX,
      fragmentShader: FRAGMENT,
    });
    this.#cloud = pointCloud(parent, owner, { most, items: { position: 3, aOrbit: 3, aTint: 3, aSize: 2 }, material });
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
    const { position, aOrbit, aTint, aSize } = this.#cloud.attributes;
    position.setXYZ(index, x, y, z);
    aOrbit.setXYZ(index, ...orbit);
    aTint.setXYZ(index, ...tint);
    aSize.setXY(index, ...size);
  }

  /** Shows the first `count`. */
  commit(count: number): void {
    this.#cloud.commit(count);
  }
}

// The warm suns (frame 4): one draw for every star and every region's glow, a quad turned to the eye with a soft fall of light, no disc and
// no hard edge, added to what is behind it. A star from afar is smaller and goes out into its region's glow, so no zoom makes one pile up.
import { HAZE, MIDDLE, type Point } from "@gnoworld/core";
import {
  AdditiveBlending,
  BufferAttribute,
  DynamicDrawUsage,
  InstancedBufferAttribute,
  InstancedBufferGeometry,
  Mesh,
  ShaderMaterial,
  type Object3D,
} from "three";
import type { Disposer } from "../disposer.ts";

interface SunLook {
  /** How far it reaches. */
  readonly reach: number;
  readonly warmth: number;
  /** Whether it is a region's glow. */
  readonly glow: boolean;
  /** How much of it shows. */
  readonly shows: number;
}

const CORNERS = new Float32Array([-1, -1, 0, 1, -1, 0, 1, 1, 0, -1, 1, 0]);
const QUAD = [0, 1, 2, 0, 2, 3];

const VERTEX = /* glsl */ `
attribute vec3 aAt;
attribute vec4 aSun;
uniform float uFocal;
varying vec2 vPlace;
varying vec2 vLight;
void main() {
  vec4 at = modelViewMatrix * vec4(aAt, 1.0);
  float away = length(at.xyz);
  float glow = aSun.z;
  float star = 1.0 - smoothstep(${(MIDDLE * 0.75).toFixed(1)}, ${MIDDLE.toFixed(1)}, away);
  float region = smoothstep(${(MIDDLE * 0.75).toFixed(1)}, ${MIDDLE.toFixed(1)}, away) * (1.0 - smoothstep(${(HAZE * 0.6).toFixed(1)}, ${HAZE.toFixed(1)}, away));
  vPlace = position.xy;
  vLight = vec2(mix(star, region, glow) * aSun.w, aSun.y);
  at.xy += position.xy * max(aSun.x, 3.0 * away / uFocal);
  gl_Position = projectionMatrix * at;
  // Behind every body, as the frames have it: a world by a sun is dark against its light, never washed by it.
  gl_Position.z = gl_Position.w * 0.99998;
}`;

// Amber far out, cream nearer, white at the heart: the frame's three steps, each a falloff, so a sun has no edge. Its reach ends in nothing.
const FRAGMENT = /* glsl */ `
varying vec2 vPlace;
varying vec2 vLight;
void main() {
  float reach = length(vPlace);
  if (reach >= 1.0) discard;
  float warmth = vLight.y;
  vec3 amber = mix(vec3(0.62, 0.2, 0.05), vec3(0.72, 0.36, 0.13), warmth);
  vec3 cream = mix(vec3(1.0, 0.62, 0.3), vec3(1.0, 0.82, 0.6), warmth);
  float wide = exp(-reach * reach * 5.5);
  float near = exp(-reach * reach * 34.0);
  float heart = exp(-reach * reach * 420.0);
  float edge = 1.0 - smoothstep(0.55, 1.0, reach);
  vec3 light = amber * wide * 0.62 * edge + cream * near * 0.7 + vec3(1.0, 0.95, 0.88) * heart * 7.0;
  gl_FragColor = vec4(light * vLight.x, 1.0);
  #include <tonemapping_fragment>
  #include <colorspace_fragment>
}`;

export class Suns {
  readonly #at: InstancedBufferAttribute;
  readonly #sun: InstancedBufferAttribute;
  readonly #geometry = new InstancedBufferGeometry();
  readonly #focal = { value: 1 };

  constructor(parent: Object3D, owner: Disposer, most: number) {
    const size = (items: number) => {
      const attribute = new InstancedBufferAttribute(new Float32Array(most * items), items);
      attribute.setUsage(DynamicDrawUsage);
      return attribute;
    };
    this.#at = size(3);
    this.#sun = size(4);
    this.#geometry.setAttribute("position", new BufferAttribute(CORNERS, 3));
    this.#geometry.setIndex(QUAD);
    this.#geometry.setAttribute("aAt", this.#at);
    this.#geometry.setAttribute("aSun", this.#sun);
    this.#geometry.instanceCount = 0;
    const material = new ShaderMaterial({
      blending: AdditiveBlending,
      depthWrite: false,
      transparent: true,
      uniforms: { uFocal: this.#focal },
      vertexShader: VERTEX,
      fragmentShader: FRAGMENT,
    });
    const mesh = new Mesh(this.#geometry, material);
    mesh.frustumCulled = false;
    parent.add(mesh);
    owner.add(this.#geometry);
    owner.add(material);
  }

  /** The lens, in pixels: a far star keeps a few pixels' worth of quad, and dims. */
  resize(focal: number): void {
    this.#focal.value = focal;
  }

  /** Sets sun `index`. */
  set(index: number, { x, y, z }: Point, { reach, warmth, glow, shows }: SunLook): void {
    this.#at.setXYZ(index, x, y, z);
    this.#sun.setXYZW(index, reach, warmth, glow ? 1 : 0, shows);
  }

  /** Shows the first `count`. */
  commit(count: number): void {
    this.#geometry.instanceCount = count;
    this.#at.needsUpdate = true;
    this.#sun.needsUpdate = true;
  }
}

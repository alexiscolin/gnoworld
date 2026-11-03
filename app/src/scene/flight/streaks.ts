// A flight's streaks (7g; ADR-0001 §7: "it crosses space with the stars streaking"; frames 18, 36, 88, 101): short warm dashes round the
// eye, each from where a speck stands now to where it stood a moment ago, never longer than an eighth of its distance, none through the eye,
// spreading from the way ahead. Their places wrap in a box that follows the eye on the GPU: one draw, four uniforms written a frame.
import { BufferAttribute, BufferGeometry, LineSegments, ShaderMaterial, AdditiveBlending, Vector3 } from "three";
import type { Point } from "@gnoworld/core";

const COUNT = 900;
// The box they wrap in, in world units, and how long a moment their tails keep, in seconds.
const BOX = 24;
const TAIL = 0.04;
// The speed past which they show whole, in world units a second: a flight's crossing, never its slow start or its landing.
const FULL = 30;
// A low-discrepancy sequence spreads them evenly with no chance in it (R3's constants).
const SPREAD = [0.8191725133961645, 0.6710436067037893, 0.5497004779019703] as const;

const VERTEX = /* glsl */ `
  attribute vec3 aAt;
  attribute float aTail;
  uniform vec3 uEye;
  uniform vec3 uWay;
  uniform float uBox;
  varying float vLight;
  void main() {
    vec3 at = mod(aAt - uEye, uBox) - 0.5 * uBox;
    float away = length(at);
    float near = smoothstep(1.5, 4.0, away) * (1.0 - smoothstep(0.3 * uBox, 0.5 * uBox, away));
    vec3 tail = uWay * aTail;
    tail *= min(1.0, 0.12 * away / max(length(tail), 1e-4));
    vLight = near * (1.0 - 0.9 * aTail);
    gl_Position = projectionMatrix * modelViewMatrix * vec4(at + tail, 1.0);
  }`;
const FRAGMENT = /* glsl */ `
  uniform float uShow;
  varying float vLight;
  void main() {
    gl_FragColor = vec4(vec3(0.9, 0.8, 0.66) * 0.7 * vLight * uShow, 1.0);
    #include <tonemapping_fragment>
    #include <colorspace_fragment>
  }`;

function places(): Float32Array {
  const at = new Float32Array(COUNT * 6);
  for (let streak = 0; streak < COUNT; streak += 1)
    for (let axis = 0; axis < 3; axis += 1) {
      const place = (((streak + 1) * (SPREAD[axis] ?? 0)) % 1) * BOX;
      at[streak * 6 + axis] = place;
      at[streak * 6 + 3 + axis] = place;
    }
  return at;
}

export class Streaks {
  readonly mesh: LineSegments<BufferGeometry, ShaderMaterial>;
  readonly #eye = { value: new Vector3() };
  readonly #way = { value: new Vector3() };
  readonly #show = { value: 0 };

  constructor() {
    const geometry = new BufferGeometry();
    geometry.setAttribute("aAt", new BufferAttribute(places(), 3));
    geometry.setAttribute(
      "aTail",
      new BufferAttribute(
        Float32Array.from({ length: COUNT * 2 }, (_, at) => at % 2),
        1,
      ),
    );
    geometry.setAttribute("position", new BufferAttribute(new Float32Array(COUNT * 6), 3));
    const material = new ShaderMaterial({
      uniforms: { uEye: this.#eye, uWay: this.#way, uBox: { value: BOX }, uShow: this.#show },
      vertexShader: VERTEX,
      fragmentShader: FRAGMENT,
      blending: AdditiveBlending,
      depthWrite: false,
      transparent: true,
    });
    this.mesh = new LineSegments(geometry, material);
    this.mesh.name = "streaks";
    this.mesh.frustumCulled = false;
    this.mesh.visible = false;
  }

  /** How many show: none at rest, all while crossing. */
  get shown(): number {
    return this.mesh.visible ? COUNT : 0;
  }

  /** Follows the eye at `at`, which moved by `by` over `seconds`: the box wraps about it, the tails trail its speed. */
  follow(at: Point, by: Point, seconds: number): void {
    this.#eye.value.set(at.x % BOX, at.y % BOX, at.z % BOX);
    const rate = seconds > 0 ? 1 / seconds : 0;
    this.#way.value.set(by.x * rate * TAIL, by.y * rate * TAIL, by.z * rate * TAIL);
    const speed = Math.hypot(by.x, by.y, by.z) * rate;
    this.#show.value = Math.min(1, speed / FULL) ** 2;
    this.mesh.visible = this.#show.value > 0.01;
  }

  /** Shows none till the next crossing. */
  hide(): void {
    this.#show.value = 0;
    this.mesh.visible = false;
  }

  dispose(): void {
    this.mesh.removeFromParent();
    this.mesh.geometry.dispose();
    this.mesh.material.dispose();
  }
}

// A flight's streaks (7g; ADR-0001 §7: "it crosses space with the stars streaking"; frames 18, 36, 88, 101): short soft warm dashes round
// the eye, of varied light, each from where a speck stands now to where it stood a moment ago, never longer than a twenty-fifth of its
// distance, none through the eye. Each is two triangles a few pixels wide, as no line is wider than one. One draw, five uniforms a frame.
import {
  AdditiveBlending,
  BufferAttribute,
  BufferGeometry,
  DoubleSide,
  Mesh,
  ShaderMaterial,
  Vector2,
  Vector3,
} from "three";
import type { Point } from "@gnoworld/core";

const COUNT = 1500;
// The box they wrap in, in world units, and how long a moment their tails keep, in seconds.
const BOX = 24;
const TAIL = 0.013;
// The speed past which they show whole, in world units a second: a flight's crossing, never its slow start or its landing.
const FULL = 30;
// A low-discrepancy sequence spreads them evenly with no chance in it (R3's constants), and the golden ratio their light.
const SPREAD = [0.8191725133961645, 0.6710436067037893, 0.5497004779019703] as const;
const GOLDEN = 0.6180339887498949;
// A dash's six corners, as two triangles: which end of it each stands at (0 now, 1 a moment ago), and which side of its line.
const TAILS = [0, 0, 1, 0, 1, 1] as const;
const SIDES = [-1, 1, 1, -1, 1, -1] as const;

const VERTEX = /* glsl */ `
  attribute vec3 aAt;
  attribute float aTail;
  attribute float aSide;
  attribute float aShade;
  uniform vec3 uEye;
  uniform vec3 uWay;
  uniform float uBox;
  uniform vec2 uPixel;
  varying float vLight;
  varying float vEdge;
  void main() {
    vec3 at = mod(aAt - uEye, uBox) - 0.5 * uBox;
    float away = length(at);
    float near = smoothstep(1.0, 2.5, away) * (1.0 - smoothstep(0.4 * uBox, 0.5 * uBox, away));
    vec3 tail = uWay * min(1.0, 0.04 * away / max(length(uWay), 1e-4));
    vec4 now = projectionMatrix * modelViewMatrix * vec4(at, 1.0);
    vec4 then = projectionMatrix * modelViewMatrix * vec4(at + tail, 1.0);
    vec2 along = then.xy / then.w - now.xy / now.w;
    vec2 across = length(along) > 1e-6 ? normalize(vec2(-along.y, along.x)) : vec2(0.0, 1.0);
    vec4 corner = mix(now, then, aTail);
    corner.xy += across * aSide * 1.25 * uPixel * corner.w;
    vLight = near * aShade * (1.0 - 0.8 * aTail);
    vEdge = aSide;
    gl_Position = corner;
  }`;
const FRAGMENT = /* glsl */ `
  uniform float uShow;
  varying float vLight;
  varying float vEdge;
  void main() {
    float soft = 1.0 - smoothstep(0.2, 1.0, abs(vEdge));
    gl_FragColor = vec4(vec3(0.9, 0.8, 0.66) * 0.8 * vLight * soft * uShow, 1.0);
    #include <tonemapping_fragment>
    #include <colorspace_fragment>
  }`;

// Each dash's six corners: its place in the box, the end and side each stands at, and its light, the same at all six.
function corners(): Record<"at" | "tail" | "side" | "shade", Float32Array> {
  const [at, tail, side, shade] = [COUNT * 18, COUNT * 6, COUNT * 6, COUNT * 6].map(
    (length) => new Float32Array(length),
  ) as [Float32Array, Float32Array, Float32Array, Float32Array];
  for (let dash = 0; dash < COUNT; dash += 1)
    for (let corner = 0; corner < 6; corner += 1) {
      const at6 = dash * 6 + corner;
      for (let axis = 0; axis < 3; axis += 1) at[at6 * 3 + axis] = (((dash + 1) * (SPREAD[axis] ?? 0)) % 1) * BOX;
      tail[at6] = TAILS[corner] ?? 0;
      side[at6] = SIDES[corner] ?? 1;
      shade[at6] = 0.35 + 0.65 * (((dash + 1) * GOLDEN) % 1);
    }
  return { at, tail, side, shade };
}

export class Streaks {
  readonly mesh: Mesh<BufferGeometry, ShaderMaterial>;
  readonly #eye = { value: new Vector3() };
  readonly #way = { value: new Vector3() };
  readonly #show = { value: 0 };
  readonly #pixel = { value: new Vector2(0.002, 0.002) };

  constructor() {
    const geometry = new BufferGeometry();
    const { at, tail, side, shade } = corners();
    geometry.setAttribute("aAt", new BufferAttribute(at, 3));
    geometry.setAttribute("aTail", new BufferAttribute(tail, 1));
    geometry.setAttribute("aSide", new BufferAttribute(side, 1));
    geometry.setAttribute("aShade", new BufferAttribute(shade, 1));
    geometry.setAttribute("position", new BufferAttribute(new Float32Array(COUNT * 18), 3));
    const material = new ShaderMaterial({
      uniforms: { uEye: this.#eye, uWay: this.#way, uBox: { value: BOX }, uShow: this.#show, uPixel: this.#pixel },
      vertexShader: VERTEX,
      fragmentShader: FRAGMENT,
      blending: AdditiveBlending,
      // A dash's triangles turn either way on screen, as its line goes.
      side: DoubleSide,
      depthWrite: false,
      transparent: true,
    });
    this.mesh = new Mesh(geometry, material);
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

  /** Sizes the dashes for a drawing buffer of `size` pixels. */
  pixel(size: Vector2): void {
    this.#pixel.value.set(2 / size.x, 2 / size.y);
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

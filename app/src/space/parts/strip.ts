// A hovered planet's own links in the Map, drawn wide and bright over the faint ones (GL lines stay one pixel): each link a quad whose
// corners are pushed half the width to its side on the screen, by the GPU. One preallocated buffer, written each frame while it shows.
import { BufferAttribute, BufferGeometry, DoubleSide, DynamicDrawUsage, Mesh, ShaderMaterial, Vector3 } from "three";
import { placeOf, type Planet, type Vec } from "../layout.ts";
import { ORBIT_COLOUR } from "./marks.ts";
import { ADDITIVE } from "../additive.ts";

// ponytail: one planet draws this many links at most; a hub with more shows its first ones. Raise it with the buffers' size.
const MOST = 256;
// raw: the strip's width in CSS pixels, its strength over the orbits' colour (still about three times the links at rest), and how long it takes to come or go
const WIDTH_PX = 1.5;
const STRENGTH = 0.6;
const EASE_S = 0.18;

/** The two worlds a link joins. */
export interface Ends {
  readonly from: Planet;
  readonly to: Planet;
}

// The eye's height in pixels is read from the projection and the frame's uProj (the pixels a unit spans at one unit's distance).
const VERTEX = /* glsl */ `
attribute vec3 aOther; attribute float aSide; uniform float uWidth; uniform float uProj;
void main() {
  vec4 a = projectionMatrix * viewMatrix * vec4(position, 1.0);
  vec4 b = projectionMatrix * viewMatrix * vec4(aOther, 1.0);
  float aspect = projectionMatrix[1][1] / projectionMatrix[0][0];
  float height = 2.0 * uProj / projectionMatrix[1][1];
  vec2 d = (b.xy / b.w - a.xy / a.w) * vec2(aspect, 1.0);
  d = length(d) > 0.0 ? normalize(d) : vec2(1.0, 0.0);
  vec2 off = vec2(-d.y, d.x) * aSide * uWidth / height;
  gl_Position = a;
  gl_Position.xy += vec2(off.x / aspect, off.y) * a.w;
}`;
const FRAGMENT =
  "uniform vec3 uColour; uniform float uGain; void main() { gl_FragColor = vec4(uColour * uGain, 1.0); }";

const NONE: readonly Ends[] = [];

const put = (out: Record<number, number>, vertex: number, { x, y, z }: Vec): void => {
  [out[vertex * 3], out[vertex * 3 + 1], out[vertex * 3 + 2]] = [x, y, z];
};

export class Strip {
  readonly mesh: Mesh;
  readonly #gain = { value: 0 };
  readonly #width = { value: 0 };
  readonly #at = new BufferAttribute(new Float32Array(MOST * 12), 3).setUsage(DynamicDrawUsage);
  readonly #other = new BufferAttribute(new Float32Array(MOST * 12), 3).setUsage(DynamicDrawUsage);
  readonly #place: Vec = { x: 0, y: 0, z: 0 };
  #links = NONE;

  constructor(uProj: { value: number }) {
    const geometry = new BufferGeometry();
    // Corners 0 and 1 stand at a link's `from` end, 2 and 3 at its `to`, each pair on either side.
    const sides = new Float32Array(MOST * 4).map((_, at) => (at % 2 === 0 ? -1 : 1));
    const index = new Uint16Array(MOST * 6);
    for (let at = 0; at < MOST; at += 1)
      index.set(
        [0, 1, 2, 1, 3, 2].map((corner) => at * 4 + corner),
        at * 6,
      );
    geometry.setAttribute("position", this.#at);
    geometry.setAttribute("aOther", this.#other);
    geometry.setAttribute("aSide", new BufferAttribute(sides, 1));
    geometry.setIndex(new BufferAttribute(index, 1));
    geometry.setDrawRange(0, 0);
    const material = new ShaderMaterial({
      uniforms: {
        uColour: { value: new Vector3(...ORBIT_COLOUR).multiplyScalar(STRENGTH) },
        uGain: this.#gain,
        uWidth: this.#width,
        uProj,
      },
      vertexShader: VERTEX,
      fragmentShader: FRAGMENT,
      transparent: true,
      depthWrite: false,
      side: DoubleSide,
      ...ADDITIVE,
    });
    this.mesh = new Mesh(geometry, material);
    this.mesh.frustumCulled = false;
    this.mesh.visible = false;
  }

  /** A frame on: `links` come, or none go (the last ones fade out); `ratio` is the buffer's pixels to the page's, `still` no fade. */
  tick(
    links: readonly Ends[] | undefined,
    { seconds, delta, still, ratio }: { seconds: number; delta: number; still: boolean; ratio: number },
  ): void {
    if (links !== undefined && links !== this.#links) {
      this.#links = links;
      this.mesh.geometry.setDrawRange(0, Math.min(links.length, MOST) * 6);
    }
    const to = links === undefined || links.length === 0 ? 0 : 1;
    this.#gain.value += (to - this.#gain.value) * (still ? 1 : 1 - Math.exp(-delta / 1000 / EASE_S));
    if (this.#gain.value < 1e-3) {
      this.#gain.value = 0;
      this.#links = NONE;
      this.mesh.geometry.setDrawRange(0, 0);
    }
    this.mesh.visible = this.#links !== NONE;
    if (!this.mesh.visible) return;
    this.#width.value = WIDTH_PX * ratio;
    this.#follow(seconds);
  }

  // The corners where the links' planets stand now: those at each end, and the other end for the quad's direction.
  #follow(seconds: number): void {
    const [at, other, pos] = [this.#at.array, this.#other.array, this.#place];
    const count = Math.min(this.#links.length, MOST);
    for (let link = 0; link < count; link += 1) {
      const each = this.#links[link];
      if (each === undefined) continue;
      for (const [planet, ends, others] of [
        [each.from, 0, 2],
        [each.to, 2, 0],
      ] as const) {
        placeOf(planet, seconds, pos);
        for (let corner = 0; corner < 2; corner += 1) {
          put(at, link * 4 + ends + corner, pos);
          put(other, link * 4 + others + corner, pos);
        }
      }
    }
    this.#at.needsUpdate = this.#other.needsUpdate = true;
  }

  dispose(): void {
    this.mesh.geometry.dispose();
    (this.mesh.material as ShaderMaterial).dispose();
  }
}

// A field of points around the eye, one shell of core's. The buffer holds a torus of cells, and the vertex shader wraps each point around
// the eye, so no frame writes a point and a far coordinate never reaches the GPU: only what remains of it. Each point stands at the far
// plane, so whatever is drawn covers it, and fades before the wrap could show, so there is no edge.
import { StarCells, wrapTo, type Point, type Shell } from "@gnoworld/core";
import {
  AdditiveBlending,
  BufferAttribute,
  BufferGeometry,
  Points,
  ShaderMaterial,
  Vector3,
  type Scene as Stage,
} from "three";
import type { Disposer } from "./disposer.ts";

const VERTEX = /* glsl */ `
attribute vec4 tint;
uniform vec3 uEye;
uniform float uSide;
uniform float uCell;
uniform float uRatio;
uniform float uNear;
uniform float uFar;
uniform float uPoint;
uniform float uFlare;
varying vec4 vLight;
void main() {
  vec3 around = mod(position - uEye + uSide * 0.5, uSide) - uSide * 0.5;
  float away = length(around);
  float fade = (1.0 - smoothstep(uFar * 0.65, uFar, away)) * smoothstep(uNear, uNear * 2.0, away);
  float light = tint.a;
  vLight = vec4(tint.rgb * fade * (0.12 + light * 0.88), light);
  gl_Position = projectionMatrix * viewMatrix * vec4(around * uCell, 1.0);
  gl_Position.z = gl_Position.w * 0.99999;
  gl_PointSize = uPoint * (1.0 + light * light * light * uFlare) * uRatio;
}`;

// A round core, sharper the brighter the star, and a faint halo: a spike or a glow would read as a namespace.
const FRAGMENT = /* glsl */ `
varying vec4 vLight;
void main() {
  vec2 at = gl_PointCoord * 2.0 - 1.0;
  float reach = dot(at, at);
  float bright = vLight.a;
  float core = exp(-reach * (3.2 + bright * bright * 6.0));
  float halo = exp(-reach * 2.0) * 0.06 * bright;
  float shape = (core + halo) * (1.0 - smoothstep(0.75, 1.0, reach));
  gl_FragColor = vec4(vLight.rgb * shape * 1.6, 1.0);
  #include <tonemapping_fragment>
  #include <colorspace_fragment>
}`;

export class Field {
  readonly #shell: Shell;
  readonly #cells: StarCells;
  readonly #position: BufferAttribute;
  readonly #tint: BufferAttribute;
  readonly #eye = new Vector3();
  readonly #ratio = { value: 1 };
  readonly #carried = { x: 0, y: 0, z: 0 };

  constructor(stage: Stage, owner: Disposer, shell: Shell) {
    this.#shell = shell;
    this.#cells = new StarCells(shell);
    this.#position = new BufferAttribute(this.#cells.positions, 3);
    this.#tint = new BufferAttribute(this.#cells.tints, 4, true);
    const geometry = owner.add(new BufferGeometry());
    geometry.setAttribute("position", this.#position);
    geometry.setAttribute("tint", this.#tint);
    const points = new Points(geometry, owner.add(this.#materialOf(shell)));
    points.frustumCulled = false;
    points.renderOrder = -1;
    stage.add(points);
    owner.add({
      dispose: () => {
        stage.remove(points);
      },
    });
  }

  #materialOf({ side, size, near, far, point, flare }: Shell): ShaderMaterial {
    return new ShaderMaterial({
      blending: AdditiveBlending,
      depthWrite: false,
      transparent: true,
      uniforms: {
        uEye: { value: this.#eye },
        uSide: { value: side },
        uCell: { value: size },
        uRatio: this.#ratio,
        uNear: { value: near },
        uFar: { value: far },
        uPoint: { value: point },
        uFlare: { value: flare },
      },
      vertexShader: VERTEX,
      fragmentShader: FRAGMENT,
    });
  }

  /** Keeps its cells around the eye, `seconds` of its wind carrying them past. */
  follow(eye: Point, seconds: number): void {
    const { side, size, wind } = this.#shell;
    const blown = wind * seconds * size;
    this.#carried.x = eye.x + blown;
    this.#carried.y = eye.y;
    this.#carried.z = eye.z + blown;
    if (this.#cells.follow(this.#carried)) {
      this.#position.needsUpdate = true;
      this.#tint.needsUpdate = true;
    }
    this.#eye.set(
      wrapTo(this.#carried.x / size, side),
      wrapTo(this.#carried.y / size, side),
      wrapTo(this.#carried.z / size, side),
    );
  }

  resize(ratio: number): void {
    this.#ratio.value = ratio;
  }
}

// Speed, as the demo shows it (D401): a radial blur towards where the camera goes, only while the stage seems to move fast (at rest no
// extra pass is drawn), and dust that streams past the eye in a flight, wrapped round it on the GPU so the CPU writes nothing a frame.
import {
  BufferGeometry,
  Float32BufferAttribute,
  HalfFloatType,
  Mesh,
  OrthographicCamera,
  PlaneGeometry,
  Points,
  Scene,
  ShaderMaterial,
  Vector2,
  Vector3,
  WebGLRenderTarget,
  type PerspectiveCamera,
  type WebGLRenderer,
} from "three";
import type { Disposer } from "../disposer.ts";
import type { Rig } from "./rig.ts";
import { BLUR_FRAGMENT, BLUR_VERTEX, DUST_FRAGMENT, DUST_VERTEX } from "./speedShaders.ts";
import { ADDITIVE } from "../additive.ts";

// The blur's strength by the stage's speed (its moves over its distance, a second): none under 0.8, all from 3.2; at most half (the
// demo's 0.5), reaching 14 % of the way to the centre at its strongest.
const BLUR_FROM = 0.8;
const BLUR_FULL = 3.2;
const BLUR_MOST = 0.5;
const BLUR_REACH = 0.14;
const RISE = 0.12;
const FALL = 0.2;
const OFF = 0.004;
const DUST = 700;

const smoothstep = (from: number, to: number, x: number): number => {
  const t = Math.min(1, Math.max(0, (x - from) / (to - from)));
  return t * t * (3 - 2 * t);
};

export class Speed {
  readonly #target = new WebGLRenderTarget(1, 1, { type: HalfFloatType, samples: 4 });
  readonly #centre = { value: new Vector2(0.5, 0.5) };
  readonly #reach = { value: 0 };
  readonly #eye = { value: new Vector3() };
  readonly #scale = { value: 50 };
  readonly #gain = { value: 0 };
  readonly #blur = new ShaderMaterial({
    uniforms: { tMap: { value: this.#target.texture }, uCentre: this.#centre, uReach: this.#reach },
    vertexShader: BLUR_VERTEX,
    fragmentShader: BLUR_FRAGMENT,
    depthTest: false,
    depthWrite: false,
  });
  readonly #screen = new Scene();
  readonly #flat = new OrthographicCamera(-1, 1, 1, -1, 0, 1);
  readonly #dust = new ShaderMaterial({
    uniforms: { uEye: this.#eye, uScale: this.#scale, uGain: this.#gain },
    vertexShader: DUST_VERTEX,
    fragmentShader: DUST_FRAGMENT,
    transparent: true,
    depthWrite: false,
    ...ADDITIVE,
  });
  readonly #size = new Vector2();
  readonly #look = new Vector3();
  #strength = 0;

  /** On `stage`, owned by `owner`. */
  constructor(stage: Scene, owner: Disposer) {
    const plane = new PlaneGeometry(2, 2);
    this.#screen.add(new Mesh(plane, this.#blur));
    const grains = new BufferGeometry();
    // Grains spread by a hash of their index: the same dust each visit, no chance drawn.
    const at = new Float32Array(DUST * 3);
    for (let i = 0; i < at.length; i += 1) at[i] = Math.abs((Math.sin(i * 12.9898) * 43758.5453) % 1);
    grains.setAttribute("position", new Float32BufferAttribute(at, 3));
    const dust = new Points(grains, this.#dust);
    dust.frustumCulled = false;
    stage.add(dust);
    owner.add({
      dispose: () => {
        stage.remove(dust);
        for (const owned of [plane, grains, this.#blur, this.#dust, this.#target]) owned.dispose();
      },
    });
  }

  /** A frame of `rig`'s: the dust's wrap and gain, and the blur's strength, eased in and out. */
  tick(rig: Rig): void {
    const { eye, pose, speed, flying } = rig;
    const want = flying ? smoothstep(BLUR_FROM, BLUR_FULL, speed) * BLUR_MOST : 0;
    this.#strength += (want - this.#strength) * (want < this.#strength ? FALL : RISE);
    const scale = Math.min(4000, Math.max(2, pose.distance * 0.8));
    this.#scale.value = scale;
    this.#eye.value.set((eye.x / scale) % 1, (eye.y / scale) % 1, (eye.z / scale) % 1);
    this.#gain.value += ((flying ? Math.min(1, speed / 2.5) : 0) - this.#gain.value) * 0.1;
    this.#look.set(pose.look.x, pose.look.y, pose.look.z);
  }

  /** Whether the frame goes through the blur's pass, which grades it anew. */
  get through(): boolean {
    return this.#strength >= OFF;
  }

  /** Draws `stage` through `camera`, blurred while fast: false where no blur runs and the caller draws it as it does. */
  draw(renderer: WebGLRenderer, stage: Scene, camera: PerspectiveCamera): boolean {
    if (this.#strength < OFF) return false;
    renderer.getDrawingBufferSize(this.#size);
    if (this.#target.width !== this.#size.x || this.#target.height !== this.#size.y)
      this.#target.setSize(this.#size.x, this.#size.y);
    this.#look.project(camera);
    this.#centre.value.set((this.#look.x + 1) / 2, (this.#look.y + 1) / 2);
    this.#reach.value = this.#strength * BLUR_REACH;
    renderer.setRenderTarget(this.#target);
    renderer.render(stage, camera);
    renderer.setRenderTarget(null);
    renderer.render(this.#screen, this.#flat);
    return true;
  }
}

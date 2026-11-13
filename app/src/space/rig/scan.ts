// The arrival's scan (D401, the video's frames 20 to 22): as the flight to a page's planet nears its end, with the page, a glare sweeps
// it from its top to its bottom in 1.8 s and draws a grid of meridians and parallels behind it, whose lines then draw back along their
// length till the planet is bare, 2.8 s on. A shell just over the planet, wherever it stands as the flight ends, so it fits whichever
// body the page draws without touching it. None under reduced motion.
import { FrontSide, Mesh, Quaternion, ShaderMaterial, SphereGeometry, Vector3, type Scene } from "three";
import type { Disposer } from "../disposer.ts";
import type { Vec } from "../layout.ts";
import type { Rig } from "./rig.ts";
import { SCAN_FRAGMENT, SCAN_VERTEX } from "./scanShaders.ts";
import { ADDITIVE } from "../additive.ts";

const DELAY = 0.1;
const SWEEP = 1.8;
const GRID_IN = 0.4;
const BAND_OUT = [1.4, 1.9] as const;
const UNDRAW = [1.9, 2.8] as const;
const SHELL = 1.004;
const Y = new Vector3(0, 1, 0);

const sineInOut = (t: number): number => -(Math.cos(Math.PI * Math.min(1, Math.max(0, t))) - 1) / 2;
const share = (t: number, [from, to]: readonly [number, number]): number =>
  Math.min(1, Math.max(0, (t - from) / (to - from)));

export class Scan {
  readonly #scan = { value: 0 };
  readonly #grid = { value: 0 };
  readonly #band = { value: 0 };
  readonly #undraw = { value: 0 };
  readonly #face = { value: 0 };
  readonly #eye = new Vector3();
  readonly #turn = new Quaternion();
  readonly #shell: Mesh<SphereGeometry, ShaderMaterial>;
  readonly #up = new Vector3();
  #time = -1;
  #radius = 0;
  readonly #still: () => boolean;

  /** On `stage`, owned by `owner`; `still` under reduced motion, where it never plays. */
  constructor(stage: Scene, owner: Disposer, still: () => boolean) {
    this.#still = still;
    const material = new ShaderMaterial({
      uniforms: { uScan: this.#scan, uGrid: this.#grid, uBand: this.#band, uUndraw: this.#undraw, uFace: this.#face },
      vertexShader: SCAN_VERTEX,
      fragmentShader: SCAN_FRAGMENT,
      transparent: true,
      depthWrite: false,
      ...ADDITIVE,
      side: FrontSide,
    });
    this.#shell = new Mesh(new SphereGeometry(SHELL, 96, 64), material);
    this.#shell.visible = false;
    stage.add(this.#shell);
    owner.add({
      dispose: () => {
        stage.remove(this.#shell);
        this.#shell.geometry.dispose();
        material.dispose();
      },
    });
  }

  /** Plays on the planet of `radius` the rig looks at; none, the scan goes. */
  readonly play = (radius: number | undefined): void => {
    this.#radius = radius ?? 0;
    this.#time = radius === undefined || this.#still() ? -1 : 0;
  };

  /** Whether it plays. */
  get playing(): boolean {
    return this.#time >= 0;
  }

  /** A frame `delta` ms on: the shell stands on the planet, `at`, in the planet's `frame`. */
  tick(rig: Rig, delta: number, { at, frame }: { at: Vec; frame?: Quaternion | undefined }): void {
    const shell = this.#shell;
    shell.visible = this.#time >= 0;
    if (!shell.visible) return;
    this.#time += delta / 1000;
    const t = this.#time - DELAY;
    // Its lines all drawn back, the scan is done: the shell goes till the next arrival.
    if (t > UNDRAW[1]) {
      this.#time = -1;
      shell.visible = false;
      return;
    }
    this.#scan.value = sineInOut(t / SWEEP);
    this.#band.value = t < 0 ? 0 : 1 - share(t, BAND_OUT);
    this.#grid.value = Math.min(1, Math.max(0, t / GRID_IN));
    this.#undraw.value = sineInOut(share(t, UNDRAW));
    const { up, way } = rig.pose;
    shell.position.set(at.x, at.y, at.z);
    // In the planet's own frame, as its skeleton stands, so the one grid hands over to the other with no change of tilt; upright to the
    // rig's up where no planet's frame is known.
    if (frame === undefined) shell.quaternion.setFromUnitVectors(Y, this.#up.set(up.x, up.y, up.z));
    else shell.quaternion.copy(frame);
    shell.scale.setScalar(this.#radius);
    // The eye's longitude on the shell: the parallels draw back to the meridian that faces it.
    const eye = this.#eye.set(way.x, way.y, way.z).applyQuaternion(this.#turn.copy(shell.quaternion).invert());
    this.#face.value = Math.atan2(eye.z, eye.x);
  }
}

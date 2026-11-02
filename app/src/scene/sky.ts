// The sky (ADR-0002 §10, "Space views": computed): a volume of cloud lit by the mood, marched in a few shells around the eye (skyPass.ts),
// half the buffer's size a side, for it is soft: a quarter of the fragments. Its picture is marched only when the view has moved past
// what a pixel of it can tell, and reaches the screen through the image's one grade, added to the stage's black.
import { MOOD_SIDE, moodCells, tilingNoise, wrapTo, type Point, type Tier } from "@gnoworld/core";
import {
  BufferAttribute,
  BufferGeometry,
  Data3DTexture,
  LinearFilter,
  Mesh,
  RedFormat,
  RepeatWrapping,
  Scene as Stage,
  Vector3,
  WebGLRenderTarget,
  type Camera,
  type WebGLRenderer,
} from "three";
import type { Disposer } from "./disposer.ts";
import { GAIN, marchMaterial, NOISE_SIDE, PERIODS, RADII, SHELLS_LOW, shownMaterial, SPAN } from "./skyPass.ts";

// Low's shells fade out over this long, and what stays lifts to the same level: a drop would show.
const FADE_SECONDS = 1;
const LOW_LIFT = 1.15;
// How far the eye goes, and the view turns, before the sky's picture is marched again: under half a pixel of it.
const MARCH_STEP = 0.05;
const MARCH_TURN = 0.0008;

const CORNERS = new Float32Array([-1, -1, 0, 3, -1, 0, -1, 3, 0]);

const volume = (data: Uint8Array, side: number) => {
  const texture = new Data3DTexture(data, side, side, side);
  texture.minFilter = LinearFilter;
  texture.magFilter = LinearFilter;
  texture.wrapS = RepeatWrapping;
  texture.wrapT = RepeatWrapping;
  texture.wrapR = RepeatWrapping;
  texture.needsUpdate = true;
  return texture;
};

export class Sky {
  readonly #pass = new Stage();
  readonly #mood = moodCells();
  readonly #moodVolume = volume(this.#mood.data, MOOD_SIDE);
  readonly #noise = volume(tilingNoise(NOISE_SIDE), NOISE_SIDE);
  readonly #picture = new WebGLRenderTarget(1, 1, { depthBuffer: false });
  readonly #uniforms = {
    uMood: { value: this.#moodVolume },
    uNoise: { value: this.#noise },
    uMoodAt: { value: new Vector3() },
    uCloudAt: { value: RADII.map(() => new Vector3()) },
    uShells: { value: RADII.length },
    uFar: { value: 1 },
    uGain: { value: GAIN },
  };
  readonly #veil = { value: 1 };
  readonly #eye = { x: 0, y: 0, z: 0 };
  readonly #marched = { x: NaN, y: NaN, z: NaN, pitch: NaN, yaw: NaN };
  #owed = true;
  #seconds = 0;
  #wanted = 1;

  constructor(stage: Stage, owner: Disposer) {
    this.#noise.format = RedFormat;
    const geometry = owner.add(new BufferGeometry());
    geometry.setAttribute("position", new BufferAttribute(CORNERS, 3));
    const clouds = new Mesh(geometry, owner.add(marchMaterial(this.#uniforms)));
    clouds.frustumCulled = false;
    this.#pass.add(clouds);
    const shown = new Mesh(geometry, owner.add(shownMaterial(this.#picture.texture, this.#veil)));
    shown.frustumCulled = false;
    shown.renderOrder = -2;
    stage.add(shown);
    owner.add(this.#moodVolume);
    owner.add(this.#noise);
    owner.add(this.#picture);
    owner.add({
      dispose: () => {
        stage.remove(shown);
      },
    });
  }

  /** Keeps the volume around the eye, and gives the GPU only what remains of a far coordinate. */
  follow(eye: Point, seconds: number): void {
    if (this.#mood.follow(eye)) {
      this.#moodVolume.needsUpdate = true;
      this.#owed = true;
    }
    this.#eye.x = eye.x;
    this.#eye.y = eye.y;
    this.#eye.z = eye.z;
    this.#uniforms.uMoodAt.value.set(
      wrapTo(eye.x, SPAN) / SPAN,
      wrapTo(eye.y, SPAN) / SPAN,
      wrapTo(eye.z, SPAN) / SPAN,
    );
    for (let shell = 0; shell < RADII.length; shell += 1) {
      const period = PERIODS[shell] ?? 1;
      this.#uniforms.uCloudAt.value[shell]?.set(
        wrapTo(eye.x, period) / period,
        wrapTo(eye.y, period) / period,
        wrapTo(eye.z, period) / period,
      );
    }
    this.#fade(seconds);
  }

  // Under reduced motion the seconds stand still, and the far shells simply go.
  #fade(seconds: number): void {
    const { uFar, uGain, uShells } = this.#uniforms;
    const step = (seconds - this.#seconds) / FADE_SECONDS;
    this.#seconds = seconds;
    if (uFar.value === this.#wanted) return;
    const left = this.#wanted - uFar.value;
    uFar.value = step > 0 && Math.abs(left) > step ? uFar.value + Math.sign(left) * step : this.#wanted;
    uGain.value = GAIN * (1 + (LOW_LIFT - 1) * (1 - uFar.value));
    uShells.value = uFar.value > 0 ? RADII.length : SHELLS_LOW;
    this.#owed = true;
  }

  #moved(camera: Camera): boolean {
    const { x, y, z, pitch, yaw } = this.#marched;
    const eye = this.#eye;
    const step = Math.abs(eye.x - x) + Math.abs(eye.y - y) + Math.abs(eye.z - z);
    const turn = Math.abs(camera.rotation.x - pitch) + Math.abs(camera.rotation.y - yaw);
    return !(step < MARCH_STEP && turn < MARCH_TURN);
  }

  /** Marches the sky's picture, if what it shows has moved past what a pixel of it can tell. */
  march(renderer: WebGLRenderer, camera: Camera): void {
    if (!this.#owed && !this.#moved(camera)) return;
    this.#owed = false;
    this.#marched.x = this.#eye.x;
    this.#marched.y = this.#eye.y;
    this.#marched.z = this.#eye.z;
    this.#marched.pitch = camera.rotation.x;
    this.#marched.yaw = camera.rotation.y;
    renderer.setRenderTarget(this.#picture);
    renderer.render(this.#pass, camera);
    renderer.setRenderTarget(null);
  }

  /** How much of the sky shows: the worlds' view keeps black between its suns. */
  veil(share: number): void {
    this.#veil.value = share;
  }

  /** The picture went: a context came back with nothing in it. */
  redraw(): void {
    this.#owed = true;
  }

  /** A side of the buffer, in its pixels. */
  resize(width: number, height: number): void {
    this.#picture.setSize(Math.max(1, Math.ceil(width / 2)), Math.max(1, Math.ceil(height / 2)));
    this.#owed = true;
  }

  /** Low fades its far shells out; a device known slow starts without them. */
  detail(tier: Tier): void {
    this.#wanted = tier === "high" ? 1 : 0;
    if (this.#seconds === 0) {
      this.#uniforms.uFar.value = this.#wanted;
      this.#uniforms.uGain.value = tier === "high" ? GAIN : GAIN * LOW_LIFT;
      this.#uniforms.uShells.value = tier === "high" ? RADII.length : SHELLS_LOW;
    }
  }
}

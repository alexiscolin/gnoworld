// The sky (ADR-0002 §10, "Space views": computed): a volume of cloud lit by the mood, marched in a few shells around the eye, each read at
// that shell's distance, so the near ones slide over the far ones as you fly; dust lanes dim what lies behind them. Half the buffer's
// size a side, for it is soft: a quarter of the fragments. Its picture holds square roots, so eight bits keep the near-black, and it
// reaches the screen through the image's one grade, dithered, added to the stage's black.
import { MOOD_SIDE, MOOD_STEP, moodCells, tilingNoise, wrapTo, type Point, type Tier } from "@gnoworld/core";
import {
  AdditiveBlending,
  BufferAttribute,
  BufferGeometry,
  Data3DTexture,
  LinearFilter,
  Mesh,
  RedFormat,
  RepeatWrapping,
  RGBAFormat,
  Scene as Stage,
  ShaderMaterial,
  Vector3,
  WebGLRenderTarget,
  type Camera,
  type WebGLRenderer,
} from "three";
import type { Disposer } from "./disposer.ts";

const NOISE_SIDE = 48;
// Each shell's distance from the eye and the width of its clouds, in world units.
const RADII = [120, 260, 520, 1000];
const CLOUDS = [260, 420, 700, 1200];
// How much of a step each shell's clouds take. Clouds are far and huge: at the eye's whole step a shell's slice through them boils, and
// each shell at its own share slides over the next.
const SLIDES = [0.3, 0.2, 0.12, 0.08];
// The noise is read at whole multiples of this many clouds: an offset that wraps then jumps nowhere.
const PERIOD = 8;
const SHELLS_LOW = 2;
const GAIN = 0.3;
const DUST = 0.85;
const SPAN = MOOD_SIDE * MOOD_STEP;

const list = (values: readonly number[]) => values.map((value) => value.toFixed(1)).join(", ");

const MARCH = /* glsl */ `
precision highp sampler3D;
uniform sampler3D uMood;
uniform sampler3D uNoise;
uniform vec3 uMoodAt;
uniform vec3 uCloudAt[${String(RADII.length)}];
uniform int uShells;
varying vec3 vRay;
const float RADII[${String(RADII.length)}] = float[${String(RADII.length)}](${list(RADII)});
const float CLOUDS[${String(RADII.length)}] = float[${String(RADII.length)}](${list(CLOUDS)});
void main() {
  vec3 ray = normalize(vRay);
  vec3 light = vec3(0.0);
  float through = 1.0;
  for (int shell = 0; shell < uShells; shell++) {
    vec3 reach = ray * RADII[shell];
    vec4 mood = texture(uMood, uMoodAt + reach / ${SPAN.toFixed(1)});
    vec3 at = uCloudAt[shell] + reach / (CLOUDS[shell] * ${PERIOD.toFixed(1)});
    float warp = texture(uNoise, at * 3.0).r - 0.5;
    float fine = texture(uNoise, at * 25.0 + warp * 0.7).r - 0.5;
    fine += (texture(uNoise, at * 67.0 + warp).r - 0.5) * 0.5;
    float cloud = smoothstep(0.36, 0.68, texture(uNoise, at * 8.0 + warp * 0.45).r + fine * 0.36);
    float lane = smoothstep(0.47, 0.63, texture(uNoise, at * 10.0 - warp * 0.6 + 0.5).r + fine * 0.24);
    light += through * mood.rgb * mood.a * (0.06 + cloud * cloud * (0.9 + cloud * cloud * 0.8)) * (1.0 - 0.2 * float(shell));
    through *= 1.0 - lane * ${DUST.toFixed(2)} * mood.a * 0.55;
  }
  gl_FragColor = vec4(sqrt(light * ${GAIN.toFixed(2)}), 1.0);
}`;

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
  readonly #picture = new WebGLRenderTarget(1, 1, { depthBuffer: false, generateMipmaps: false });
  readonly #marching: ShaderMaterial;

  constructor(stage: Stage, owner: Disposer) {
    this.#noise.format = RedFormat;
    this.#noise.unpackAlignment = 1;
    this.#moodVolume.format = RGBAFormat;
    this.#picture.texture.minFilter = LinearFilter;
    const geometry = owner.add(new BufferGeometry());
    geometry.setAttribute("position", new BufferAttribute(CORNERS, 3));
    this.#marching = owner.add(this.#marchMaterial());
    const clouds = new Mesh(geometry, this.#marching);
    clouds.frustumCulled = false;
    this.#pass.add(clouds);
    const shown = new Mesh(geometry, owner.add(this.#shownMaterial()));
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

  #marchMaterial(): ShaderMaterial {
    return new ShaderMaterial({
      depthTest: false,
      depthWrite: false,
      toneMapped: false,
      uniforms: {
        uMood: { value: this.#moodVolume },
        uNoise: { value: this.#noise },
        uMoodAt: { value: new Vector3() },
        uCloudAt: { value: RADII.map(() => new Vector3()) },
        uShells: { value: RADII.length },
      },
      vertexShader: /* glsl */ `
        varying vec3 vRay;
        void main() {
          vRay = mat3(inverse(viewMatrix)) * vec3(position.x / projectionMatrix[0][0], position.y / projectionMatrix[1][1], -1.0);
          gl_Position = vec4(position.xy, 1.0, 1.0);
        }`,
      fragmentShader: MARCH,
    });
  }

  #shownMaterial(): ShaderMaterial {
    return new ShaderMaterial({
      blending: AdditiveBlending,
      depthTest: false,
      depthWrite: false,
      dithering: true,
      uniforms: { uSky: { value: this.#picture.texture } },
      vertexShader: /* glsl */ `
        varying vec2 vUv;
        void main() {
          vUv = position.xy * 0.5 + 0.5;
          gl_Position = vec4(position.xy, 1.0, 1.0);
        }`,
      fragmentShader: /* glsl */ `
        #include <common>
        #include <dithering_pars_fragment>
        uniform sampler2D uSky;
        varying vec2 vUv;
        void main() {
          vec3 root = texture2D(uSky, vUv).rgb;
          gl_FragColor = vec4(root * root, 1.0);
          #include <tonemapping_fragment>
          #include <colorspace_fragment>
          #include <dithering_fragment>
        }`,
    });
  }

  /** Keeps the volume around the eye, and gives the GPU only what remains of a far coordinate. */
  follow(eye: Point): void {
    if (this.#mood.follow(eye)) this.#moodVolume.needsUpdate = true;
    const { uMoodAt, uCloudAt } = this.#marching.uniforms;
    (uMoodAt?.value as Vector3).set(wrapTo(eye.x, SPAN) / SPAN, wrapTo(eye.y, SPAN) / SPAN, wrapTo(eye.z, SPAN) / SPAN);
    const shells = uCloudAt?.value as Vector3[];
    for (let shell = 0; shell < RADII.length; shell += 1) {
      const period = ((CLOUDS[shell] ?? 1) * PERIOD) / (SLIDES[shell] ?? 1);
      shells[shell]?.set(
        wrapTo(eye.x, period) / period,
        wrapTo(eye.y, period) / period,
        wrapTo(eye.z, period) / period,
      );
    }
  }

  march(renderer: WebGLRenderer, camera: Camera): void {
    renderer.setRenderTarget(this.#picture);
    renderer.render(this.#pass, camera);
    renderer.setRenderTarget(null);
  }

  /** A side of the buffer, in its pixels. */
  resize(width: number, height: number): void {
    this.#picture.setSize(Math.max(1, Math.ceil(width / 2)), Math.max(1, Math.ceil(height / 2)));
  }

  detail(tier: Tier): void {
    const { uShells } = this.#marching.uniforms;
    if (uShells !== undefined) uShells.value = tier === "high" ? RADII.length : SHELLS_LOW;
  }
}

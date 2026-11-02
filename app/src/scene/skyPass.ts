// The sky's two passes: the march through its shells, whose picture holds square roots so eight bits keep the near-black, and the one
// that shows it through the image's grade, dithered, added to the stage's black. The march runs outside the grade: it draws no screen.
import { MOOD_SIDE, MOOD_STEP } from "@gnoworld/core";
import { AdditiveBlending, ShaderMaterial, type Texture } from "three";

export const NOISE_SIDE = 48;
// Each shell's distance from the eye and the width of its clouds, in world units.
export const RADII = [120, 260, 520, 1000];
const CLOUDS = [260, 420, 700, 1200];
// How much of a step each shell's clouds take. Clouds are far and huge: at the eye's whole step a shell's slice through them boils, and
// each shell at its own share slides over the next.
const SLIDES = [0.3, 0.2, 0.12, 0.08];
// The noise is read at whole multiples of this many clouds: an offset that wraps then jumps nowhere.
const PERIOD = 8;
export const SHELLS_LOW = 3;
export const GAIN = 0.34;
const DUST = 0.9;
export const SPAN = MOOD_SIDE * MOOD_STEP;
export const PERIODS = CLOUDS.map((cloud, shell) => (cloud * PERIOD) / (SLIDES[shell] ?? 1));

const list = (values: readonly number[]) => values.map((value) => value.toFixed(1)).join(", ");

// TURNED's whole numbers keep the cube tiling: a turn that lays its lattice off the axes, for nothing in a nebula runs along them.
const MARCH = /* glsl */ `
precision highp sampler3D;
uniform sampler3D uMood;
uniform sampler3D uNoise;
uniform vec3 uMoodAt;
uniform vec3 uCloudAt[${String(RADII.length)}];
uniform int uShells;
uniform float uFar;
uniform float uGain;
varying vec3 vRay;
float cube(vec3 at) {
  return texture(uNoise, at).r;
}
const float RADII[${String(RADII.length)}] = float[${String(RADII.length)}](${list(RADII)});
const float CLOUDS[${String(RADII.length)}] = float[${String(RADII.length)}](${list(CLOUDS)});
const mat3 TURNED = mat3(2.0, -1.0, 1.0, 1.0, 2.0, -1.0, -1.0, 1.0, 2.0);
void main() {
  vec3 ray = normalize(vRay);
  vec3 light = vec3(0.0);
  float through = 1.0;
  for (int shell = 0; shell < uShells; shell++) {
    vec3 reach = ray * RADII[shell];
    vec4 mood = texture(uMood, uMoodAt + reach / ${SPAN.toFixed(1)});
    if (mood.a < 0.002) continue;
    float weight = shell < ${String(SHELLS_LOW)} ? 1.0 : uFar;
    vec3 at = uCloudAt[shell] + reach / (CLOUDS[shell] * ${PERIOD.toFixed(1)});
    float warp = cube(TURNED * at) - 0.5;
    float fine = cube(TURNED * at * 11.0 + warp * 0.7) - 0.5;
    fine += (cube(TURNED * at * 27.0 + warp) - 0.5) * 0.5;
    float body = cube(TURNED * at * 3.0 + warp * 0.45) + fine * 0.36;
    float cloud = smoothstep(0.42, 0.72, body);
    float heart = smoothstep(0.5, 0.95, body + fine * 0.3);
    float rim = exp(-pow((body - 0.5) / 0.035, 2.0));
    float ridge = 1.0 - abs(2.0 * cube(TURNED * at * 2.0 - warp + 0.5) - 1.0) + fine * 0.3;
    float lane = smoothstep(0.72, 0.96, ridge);
    float glow = cloud * cloud * 0.55 + heart * heart * 4.5 + rim * 0.2;
    light += through * mood.rgb * mood.a * (0.05 + glow) * (1.0 - 0.2 * float(shell)) * weight;
    through *= 1.0 - lane * ${DUST.toFixed(2)} * mood.a * weight;
  }
  gl_FragColor = vec4(sqrt(light * uGain), 1.0);
}`;

export const marchMaterial = (uniforms: Record<string, { value: unknown }>): ShaderMaterial =>
  new ShaderMaterial({
    depthTest: false,
    depthWrite: false,
    toneMapped: false,
    uniforms,
    vertexShader: /* glsl */ `
      varying vec3 vRay;
      void main() {
        vRay = mat3(inverse(viewMatrix)) * vec3(position.x / projectionMatrix[0][0], position.y / projectionMatrix[1][1], -1.0);
        gl_Position = vec4(position.xy, 1.0, 1.0);
      }`,
    fragmentShader: MARCH,
  });

export const shownMaterial = (picture: Texture, veil: { value: number }): ShaderMaterial =>
  new ShaderMaterial({
    blending: AdditiveBlending,
    depthTest: false,
    depthWrite: false,
    dithering: true,
    uniforms: { uSky: { value: picture }, uVeil: veil },
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
      uniform float uVeil;
      varying vec2 vUv;
      void main() {
        vec3 root = texture2D(uSky, vUv).rgb;
        gl_FragColor = vec4(root * root * uVeil, 1.0);
        #include <tonemapping_fragment>
        #include <colorspace_fragment>
        #include <dithering_fragment>
      }`,
  });

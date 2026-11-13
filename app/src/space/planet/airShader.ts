// The air: light scattered along each ray through a shell, not a painted rim, so a world lit from behind wears a thin ring of light and a
// sunset along its terminator. Eight steps a pixel, in the world's own radii, over the whole disc: the shell's front covers it, so a close world pays for all of it.
// A glowing world's air takes light from its own glow (`selfLight`, its level): its edge in its air's cream all round, as frame 4's Music.
// Framed close on a page (`close`, D458), its lit limb is pushed into a bright crescent toward the sun.
import { FARAWAY } from "./chunks.ts";
import { PLATE_CLEAR } from "./plateMask.ts";

/** The light scattered past the limb of a world framed close (D463): a quad turned to the eye in the plane of the planet's middle; its air's
 * colour past the limb, thick on the lit side and gone round the night, and where the sun stands at the limb a warm glare that washes over
 * it with a lens's level streak (D482), the stronger the more the sun stands behind the planet; none over the plate's words (D490). */
export const GLOW_VERTEX = /* glsl */ `
uniform vec3 sun;
varying vec2 vAt;
varying vec2 vSun;
varying float vBehind;
const float REACH = 2.2;
void main() {
  vec4 centre = modelViewMatrix * vec4(0.0, 0.0, 0.0, 1.0);
  float radius = length(modelMatrix[0].xyz);
  float away = length(centre.xyz);
  float limb = radius * away / sqrt(max(away * away - radius * radius, 1.0e-6));
  vAt = position.xy * REACH;
  vec3 toSun = (viewMatrix * vec4(sun, 0.0)).xyz;
  vSun = normalize(toSun.xy + 1.0e-6);
  vBehind = smoothstep(0.75, -0.45, toSun.z);
  vec4 clip = projectionMatrix * vec4(centre.xyz + vec3(position.xy * limb * REACH, 0.0), 1.0);
  // The quad stands at the depth of the planet's nearest point, so the planet never hides its own glare and a body in front of the planet does.
  vec4 nearest = projectionMatrix * vec4(0.0, 0.0, min(centre.z + radius, 0.5 * centre.z), 1.0);
  gl_Position = vec4(clip.xy, nearest.z / nearest.w * clip.w, clip.w);
}
`;

export const GLOW_FRAGMENT = /* glsl */ `
${PLATE_CLEAR}
uniform vec3 glowColour;
uniform float close;
uniform float arrive;
varying vec2 vAt;
varying vec2 vSun;
varying float vBehind;
void main() {
  float past = length(vAt) - 1.0;
  float toward = dot(vAt / max(length(vAt), 1.0e-4), vSun);
  float lit = smoothstep(-0.2, 0.95, toward);
  float near = exp(-max(past, 0.0) * 24.0);
  float wide = exp(-max(past, 0.0) * 9.0) * (1.0 - smoothstep(0.08, 0.16, past));
  float flare = pow(max(toward, 0.0), 10.0) * wide;
  vec3 light = glowColour * (near * 0.8 + wide * 0.22) * lit + vec3(1.0, 0.94, 0.84) * flare * 0.3;
  light *= smoothstep(-0.02, 0.0, past);
  vec2 spot = vSun * 1.03;
  vec2 off = vAt - spot;
  float glare = exp(-length(off) * 11.0) * 0.75 + exp(-length(off) * 5.0) * 0.14;
  float streak = exp(-abs(off.y) * 90.0) * exp(-abs(off.x) * 3.0) * 0.2;
  light += mix(vec3(1.0, 0.86, 0.68), glowColour, 0.2) * (glare + streak) * vBehind;
  gl_FragColor = vec4(light * close * arrive * plateClear(), 1.0);
  #include <tonemapping_fragment>
  #include <colorspace_fragment>
}
`;

export const AIR_VERTEX = /* glsl */ `
varying vec3 vWorld;
varying vec3 vCentre;
varying float vOuter;
void main() {
  vec4 world = modelMatrix * vec4(position, 1.0);
  vWorld = world.xyz;
  vCentre = modelMatrix[3].xyz;
  vOuter = length(modelMatrix[0].xyz);
  gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
}
`;

export const AIR_FRAGMENT = /* glsl */ `
uniform vec3 sun;
uniform vec3 rimColour;
uniform float rimThickness;
uniform float limbLight, selfLight;
uniform float faraway;
uniform float close;
uniform float arrive;
varying vec3 vWorld;
varying vec3 vCentre;
varying float vOuter;
const int STEPS = 8;
const float STRENGTH = 11.0;
const float GLARE = 0.8;
const float CLOSE_LIMB = 1.4;

vec2 through(vec3 from, vec3 towards, float radius) {
  float b = dot(from, towards);
  float h = b * b - dot(from, from) + radius * radius;
  if (h < 0.0) return vec2(1.0e6, -1.0e6);
  h = sqrt(h);
  return vec2(-b - h, -b + h);
}

void main() {
  float limb = max(limbLight, close * CLOSE_LIMB);
  vec3 centre = vCentre;
  float outer = 1.0 + rimThickness;
  float radius = vOuter / outer;
  vec3 eye = (cameraPosition - centre) / radius;
  vec3 ray = normalize((vWorld - centre) / radius - eye);
  vec2 shell = through(eye, ray, outer);
  vec2 ground = through(eye, ray, 1.0);
  float near = max(shell.x, 0.0);
  float far = ground.x > 0.0 ? min(shell.y, ground.x) : shell.y;
  float stride = max(far - near, 0.0) / float(STEPS);
  float scale = rimThickness * 0.26;
  vec3 scatter = rimColour * rimColour * STRENGTH;
  vec3 gathered = vec3(0.0);
  float thick = 0.0;
  for (int i = 0; i < STEPS; i++) {
    vec3 at = eye + ray * (near + (float(i) + 0.5) * stride);
    float height = max(length(at) - 1.0, 0.0);
    float density = exp(-height / scale) * stride;
    thick += density;
    float across = length(cross(at, sun));
    float lit = smoothstep(1.0 - scale * 0.2, 1.0 + scale * 2.0, dot(at, sun) < 0.0 ? across : 2.0);
    if (limb > 0.0) lit = mix(smoothstep(1.0 - scale * 0.2, 1.0 + scale * 2.0, across), 1.0, smoothstep(-0.08, 0.08, dot(at, sun)));
    float toSun = max(through(at, sun, outer).y, 0.0);
    vec3 passed = exp(-scatter * (thick + exp(-height / scale) * toSun * 0.5));
    gathered += density * lit * passed;
  }
  float cosine = dot(ray, sun);
  float rayleigh = 0.75 * (1.0 + cosine * cosine);
  float g2 = GLARE * GLARE;
  float mie = (1.0 - g2) / (12.566 * pow(1.0 + g2 - 2.0 * GLARE * cosine, 1.5));
  vec3 light = gathered * scatter * rayleigh + gathered * mie * 5.0 * mix(vec3(1.0, 0.9, 0.78), rimColour, 0.35);
  if (limb > 0.0) {
    float along = -dot(eye, ray);
    vec3 nearest = eye + ray * along;
    float over = length(nearest) - 1.0;
    float warm = sign(selfLight);
    vec3 own = rimColour * vec3(1.0, 0.86, 0.62);
    float facing = dot(normalize(nearest), sun);
    float lit = max(mix(smoothstep(-0.35, 0.25, facing), smoothstep(0.05, 0.55, facing), close), selfLight);
    float line = smoothstep(-0.004, 0.003, over) * exp(-max(over, 0.0) / (rimThickness * 0.3));
    float band = smoothstep(-0.003, 0.002, over) * (1.0 - smoothstep(rimThickness * 0.42, rimThickness * 0.62, over));
    float haze = smoothstep(-0.075, 0.0, over) * (1.0 - smoothstep(-0.002, 0.003, over));
    light = mix(light, mix(vec3(0.16, 0.22, 0.33), own * 0.4, warm) * dot(light, vec3(0.34)), 0.42);
    // Framed close, the band thins to a fine line of light (D482): the glare at the sun's side carries the limb, not a flat ring.
    light += (mix(vec3(0.6, 0.78, 1.0), own, warm) * line * 0.5 + mix(vec3(0.47, 0.62, 0.82), own, warm) * band * mix(0.5, 0.12, close) + mix(vec3(0.02, 0.035, 0.06), own * 0.1, warm) * haze) * limb * lit;
  }
  float veil = 1.0 - exp(-dot(scatter, vec3(0.333)) * thick);
  gl_FragColor = vec4(light * 0.8, veil * 0.5 * min(dot(light, vec3(4.0)), 1.0));
  ${FARAWAY} gl_FragColor *= arrive;
  #include <tonemapping_fragment>
  #include <colorspace_fragment>
}
`;

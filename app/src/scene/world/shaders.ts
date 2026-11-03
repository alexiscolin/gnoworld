// What a world seen close adds to its approved render, as two programs of its own: the status ring's tube, and one overlay over its ground
// that only adds (ADR-0002 §3, layer 5). Comments stay out of the strings: they would ship.
import { TURNED } from "../planet/surfaceParts.ts";
import { SPIN } from "../planet/surfaceShader.ts";

/** At most this many bodies cast a shadow on the world: four moons and the ring's. */
export const OCCLUDERS_MAX = 5;

// The status ring's tube: lit from its left end (π) to its moon, faint past it, a bright tick at the threshold. The depth test hides its back
// behind the world; `litTo` and `mark` are angles round the orbit, the tube's own u.
export const STATUS_FRAGMENT = /* glsl */ `
uniform float litTo;
uniform float against;
uniform float mark;
varying vec3 vNormal;
varying vec3 vToEye;
varying vec3 vCentre;
varying float vAlong;
const float TAU = 6.28318530718;
const float HALF = 3.14159265359;
void main() {
  vec3 ray = normalize(vToEye);
  float centred = max(dot(normalize(vNormal), ray), 0.0);
  float angle = vAlong * TAU;
  float lit = step(litTo, angle) * step(angle, HALF);
  float refused = step(angle, against) * step(0.0001, against);
  float tick = (1.0 - smoothstep(0.012, 0.024, abs(angle - mark))) * step(0.0, mark);
  vec3 amber = vec3(1.0, 0.56, 0.2) * (pow(centred, 40.0) * 0.6 + pow(centred, 8.0) * 0.12);
  vec3 core = vec3(1.0, 0.88, 0.7) * pow(centred, 300.0) * 2.2;
  vec3 coral = vec3(0.95, 0.42, 0.36) * (pow(centred, 40.0) * 0.6 + pow(centred, 8.0) * 0.12);
  vec3 colour = (amber + core) * (0.16 + 0.84 * lit) + coral * 0.84 * refused * (1.0 - lit);
  colour += vec3(1.0, 0.95, 0.86) * tick * pow(centred, 4.0) * 1.4;
  gl_FragColor = vec4(colour, 1.0);
  #include <tonemapping_fragment>
  #include <colorspace_fragment>
}
`;

export const OVERLAY_VERTEX = /* glsl */ `
varying vec3 vLocal;
varying vec3 vWorld;
varying vec3 vNormal;
void main() {
  vLocal = position;
  vec4 world = modelMatrix * vec4(position, 1.0);
  vWorld = world.xyz;
  vNormal = normalize(mat3(modelMatrix) * normal);
  gl_Position = projectionMatrix * viewMatrix * world;
}
`;

// The first visit's grid, measured on frame 104: a meridian every 36 degrees, parallels at 18 and 54 degrees either side of the equator,
// none on it nor at the poles (past 1.2 radians); lines about 1.5 px wide at any size, by their own screen derivatives. Its steps a radian.
const STEPS = (5 / Math.PI).toFixed(6);
// The band's glow is 0.12 of the radius wide (frame 103). Its light and a line's, read on frames 103 and 104 through the scene's tone
// mapping: (211, 217, 215) laid over a black night, covering 0.88 of what is under it, on the day side and the night side alike.

// shadowOf: each body between the point and the one sun darkens it, with a soft penumbra; only the day side has light to lose. stormOf: a
// cyclone's spiral arms round a centre fixed on the ground, which turns as the surface does, its size from its strength. The aurora rings each pole on the night side and
// shimmers with time; the heat warms the limb. All of it is premultiplied: a shadow darkens what is under it, the rest adds; the grid and its band cover.
export const OVERLAY_FRAGMENT = /* glsl */ `
uniform vec3 sun;
uniform float time;
uniform float aurora;
uniform vec3 storms;
uniform vec3 stormAt[3];
uniform float heat;
uniform vec4 occluders[${String(OCCLUDERS_MAX)}];
uniform float occluderCount;
uniform float band;
uniform float grid;
varying vec3 vLocal;
varying vec3 vWorld;
varying vec3 vNormal;

${TURNED}
float lineOf(float along) {
  return 1.0 - smoothstep(0.35, 1.1, abs(fract(along + 0.5) - 0.5) / max(fwidth(along), 1e-5));
}

float gridOf(vec3 ground) {
  float latitude = asin(clamp(ground.y, -1.0, 1.0));
  return max(lineOf(atan(ground.z, ground.x) * ${STEPS}), lineOf(latitude * ${STEPS} + 0.5) * step(abs(latitude), 1.2));
}

float shadowOf(vec3 point) {
  float dark = 0.0;
  for (int at = 0; at < ${String(OCCLUDERS_MAX)}; at++) {
    if (float(at) >= occluderCount) break;
    vec3 toBody = occluders[at].xyz - point;
    float along = dot(toBody, sun);
    float miss = length(toBody - sun * along);
    float radius = occluders[at].w;
    float covered = 1.0 - smoothstep(radius * 0.82, radius * 1.18, miss);
    dark = max(dark, along > 0.0 ? covered : 0.0);
  }
  return dark;
}

float stormOf(vec3 ground, vec3 centre, float strength) {
  vec3 side = normalize(cross(centre, abs(centre.y) < 0.9 ? vec3(0.0, 1.0, 0.0) : vec3(1.0, 0.0, 0.0)));
  vec3 up = cross(centre, side);
  float reach = 0.1 + 0.16 * strength;
  float far = acos(clamp(dot(ground, centre), -1.0, 1.0)) / reach;
  float turn = atan(dot(ground, up), dot(ground, side));
  float arms = 0.5 + 0.5 * sin(turn * 2.0 + far * 9.0 - time * 0.05);
  return strength * (1.0 - smoothstep(0.2, 1.0, far)) * mix(0.35, 1.0, arms) * (0.6 + 0.4 * (1.0 - far));
}

void main() {
  vec3 ground = turned(normalize(vLocal), time * ${String(SPIN)});
  vec3 normal = normalize(vNormal);
  vec3 view = normalize(cameraPosition - vWorld);
  float day = dot(normal, sun);
  float daylight = smoothstep(-0.05, 0.25, day);
  float shade = occluderCount > 0.0 ? shadowOf(vWorld) * daylight * 0.86 : 0.0;
  float cloud = 0.0;
  for (int at = 0; at < 3; at++) {
    float strength = storms[at];
    if (strength > 0.0) cloud = max(cloud, stormOf(ground, stormAt[at], strength));
  }
  cloud = clamp(cloud * 0.9, 0.0, 0.92);
  vec3 cloudLight = vec3(0.9, 0.91, 0.94) * (0.04 + 0.96 * daylight);
  float pole = abs(ground.y);
  float shimmer = 0.6 + 0.4 * sin(atan(ground.z, ground.x) * 14.0 + time * 0.7);
  float fromOval = (pole - 0.92) / 0.035;
  float oval = exp(-fromOval * fromOval) * shimmer;
  vec3 auroraLight = mix(vec3(0.22, 1.0, 0.56), vec3(0.6, 0.35, 1.0), smoothstep(0.92, 0.97, pole)) * oval * aurora * (0.25 + 0.75 * (1.0 - daylight));
  float edge = pow(1.0 - max(dot(normal, view), 0.0), 3.0);
  vec3 heatLight = vec3(1.0, 0.6, 0.28) * edge * heat * 0.55;
  float alpha = 1.0 - (1.0 - cloud) * (1.0 - shade);
  vec3 colour = cloudLight * cloud * (1.0 - shade) + auroraLight + heatLight;
  if (grid > 0.0) {
    float fromBand = (ground.y - band) / 0.12;
    float light = max(gridOf(ground) * step(band, ground.y), exp(-fromBand * fromBand)) * grid;
    colour = colour * (1.0 - 0.88 * light) + vec3(0.83, 0.95, 0.89) * light;
    alpha = 1.0 - (1.0 - alpha) * (1.0 - 0.88 * light);
  }
  gl_FragColor = vec4(colour, alpha);
  #include <tonemapping_fragment>
  #include <colorspace_fragment>
}
`;

// The wake: a ring of light running out from a seed as it becomes a world, and gone in a few seconds.
export const WAKE_FRAGMENT = /* glsl */ `
uniform float wave;
varying vec2 vPlace;
void main() {
  float far = length(vPlace);
  float front = 1.0 - wave;
  float fromFront = (far - front) / 0.06;
  float band = exp(-fromFront * fromFront) * wave;
  float inner = (1.0 - smoothstep(0.0, front, far)) * wave * 0.12;
  gl_FragColor = vec4(vec3(1.0, 0.82, 0.92) * (band + inner), 1.0);
  #include <tonemapping_fragment>
  #include <colorspace_fragment>
}
`;

// The soft halo on a world's limb, brightest on the side its star lights: a plane facing the eye behind the world, which hides its middle.
// `litSide` is the star's side on screen; the plane reaches HALO_REACH radii.
export const HALO_REACH = 1.32;
export const LIMB_HALO_FRAGMENT = /* glsl */ `
uniform vec2 litSide;
uniform vec3 rimColour;
varying vec2 vPlace;
void main() {
  float far = length(vPlace) * ${String(HALO_REACH)};
  float clear = smoothstep(0.97, 1.0, far);
  float fade = exp(-(far - 1.0) * 10.0) * 0.5 + exp(-(far - 1.0) * 3.5) * 0.08;
  float side = 0.2 + 0.8 * max(dot(normalize(vPlace + 1e-5), litSide), 0.0);
  gl_FragColor = vec4(rimColour * clear * fade * side, 1.0);
  #include <tonemapping_fragment>
  #include <colorspace_fragment>
}
`;

// The haze of the system's star, far behind the world on its lit side: a warm, low light, never a blinding one.
export const STAR_HAZE_FRAGMENT = /* glsl */ `
uniform vec2 litSide;
varying vec2 vPlace;
void main() {
  float far = length(vPlace);
  float light = (exp(-far * 3.0) * 0.16 + exp(-far * 14.0) * 0.22) * (1.0 - smoothstep(0.7, 1.0, far));
  gl_FragColor = vec4(vec3(1.0, 0.8, 0.58) * light, 1.0);
  #include <tonemapping_fragment>
  #include <colorspace_fragment>
}
`;

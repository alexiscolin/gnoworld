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
  float tick = 1.0 - smoothstep(0.012, 0.024, abs(angle - mark));
  vec3 amber = vec3(1.0, 0.56, 0.2) * (pow(centred, 40.0) * 0.6 + pow(centred, 8.0) * 0.12);
  vec3 core = vec3(1.0, 0.88, 0.7) * pow(centred, 300.0) * 2.2;
  vec3 colour = (amber + core) * (0.16 + 0.84 * lit) + vec3(1.0, 0.95, 0.86) * tick * pow(centred, 4.0) * 1.4;
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

// shadowOf: each body between the point and the one sun darkens it, with a soft penumbra; only the day side has light to lose. stormOf: a
// cyclone's spiral arms round a centre fixed on the ground, which turns as the surface does, its size from its strength. The aurora rings each pole on the night side and
// shimmers with time; the heat warms the limb. All of it is premultiplied: a shadow darkens what is under it, the rest adds.
export const OVERLAY_FRAGMENT = /* glsl */ `
uniform vec3 sun;
uniform float time;
uniform float aurora;
uniform vec3 storms;
uniform vec3 stormAt[3];
uniform float heat;
uniform vec4 occluders[${String(OCCLUDERS_MAX)}];
uniform float occluderCount;
varying vec3 vLocal;
varying vec3 vWorld;
varying vec3 vNormal;

${TURNED}
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

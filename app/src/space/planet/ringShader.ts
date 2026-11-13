// Rings: wide, with gaps from one shared profile, in the world's shadow, brightening when lit from behind as thin ice does. Never the status
// ring, which is a thin tilted line with its moon (ADR-0002 §10).
import { FARAWAY, FIELD } from "./chunks.ts";

export const RING_VERTEX = /* glsl */ `
varying vec3 vWorld;
varying vec3 vCentre;
varying float vRadius;
varying float vWorldRadius;
varying vec2 vPlane;
void main() {
  vPlane = position.xy;
  vRadius = length(position.xy);
  vec4 world = modelMatrix * vec4(position, 1.0);
  vWorld = world.xyz;
  vCentre = modelMatrix[3].xyz;
  vWorldRadius = length(modelMatrix[0].xyz);
  gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
}
`;

// The rings turn as real rings do: each radius at its own Keplerian pace (a period as the radius to the three halves), so the inside runs
// ahead. Spokes, faint streaks that drift with it, are a lattice's noise from the world's seed; two copies, half a cycle apart, fade into
// each other, so the shear never winds them into lines. They darken against the light and brighten with it, as dust does.
const SPOKES = /* glsl */ `
${FIELD}
const float SECTORS = 90.0;
const float LAP = 0.006;
const float CYCLE = 1200.0;
float latticeOf(ivec2 c) {
  return 0.5 + 0.5 * latticeAt(ivec3(c, 0)).x;
}
float streaks(float sector, float depth) {
  vec2 p = vec2(sector, depth);
  vec2 i = floor(p);
  vec2 f = p - i;
  vec2 u = f * f * (3.0 - 2.0 * f);
  int seed = int(ringSeed * 4096.0);
  float x0 = mod(i.x, SECTORS);
  float x1 = mod(i.x + 1.0, SECTORS);
  float a = mix(latticeOf(ivec2(int(x0), int(i.y) + seed)), latticeOf(ivec2(int(x1), int(i.y) + seed)), u.x);
  float b = mix(latticeOf(ivec2(int(x0), int(i.y) + 1 + seed)), latticeOf(ivec2(int(x1), int(i.y) + 1 + seed)), u.x);
  return mix(a, b, u.y);
}
float spokesAt(float reach, float phi, float small) {
  float pace = LAP * pow((ringInner + reach * (ringOuter - ringInner)) / ringInner, -1.5);
  float turn = fract(ringTime / CYCLE);
  float second = fract(turn + 0.5);
  float sector = phi / 6.2831853 * SECTORS;
  float first = streaks(sector - pace * turn * CYCLE * SECTORS / 6.2831853, reach * 3.0);
  float later = streaks(sector - pace * second * CYCLE * SECTORS / 6.2831853 + 17.0, reach * 3.0 + 31.0);
  float weight = 1.0 - abs(2.0 * turn - 1.0);
  float body = smoothstep(0.1, 0.35, reach) * (1.0 - smoothstep(0.6, 0.9, reach)) * (1.0 - smoothstep(0.01, 0.04, small));
  return smoothstep(0.62, 0.92, mix(later, first, weight)) * body;
}
`;

// Past what a pixel can hold the fine lines go, or they beat against the pixels as they turn: a ring seen small is its smooth mean. The
// world's shadow dims the ring, never cuts it: the rest is what the ice scatters (a hole in a ring was a bug).
export const RING_FRAGMENT = /* glsl */ `
uniform sampler2D ringMap;
uniform vec3 sun;
uniform vec3 ringTint;
uniform float ringInner;
uniform float ringOuter;
uniform float ringOpacity;
uniform float faraway;
uniform float arrive;
uniform float ringSeed;
uniform float ringTime;
varying vec2 vPlane;
varying vec3 vWorld;
varying vec3 vCentre;
varying float vRadius;
varying float vWorldRadius;
const float SHADED = 0.3;
${SPOKES}

void main() {
  float reach = (vRadius - ringInner) / (ringOuter - ringInner);
  float small = fwidth(reach);
  float fine = 0.5 + 0.3 * sin(reach * 61.0) * sin(reach * 23.0 + 1.3) * (1.0 - smoothstep(0.008, 0.03, small)) + 0.2 * sin(reach * 131.0 + 0.4) * (1.0 - smoothstep(0.002, 0.012, small));
  float spoke = spokesAt(reach, atan(vPlane.y, vPlane.x), small);
  float density = texture2D(ringMap, vec2(reach, 0.5)).r * ringOpacity * (0.52 + 0.48 * fine);
  vec3 at = (vWorld - vCentre) / vWorldRadius;
  float past = dot(at, sun) < 0.0 ? length(cross(at, sun)) : 2.0;
  float lit = mix(SHADED, 1.0, smoothstep(0.9, 1.1, past));
  vec3 view = normalize(cameraPosition - vWorld);
  float behind = smoothstep(0.1, 1.0, -dot(view, sun));
  density *= 1.0 - 0.3 * spoke * (1.0 - behind);
  vec3 colour = mix(ringTint, vec3(0.72, 0.68, 0.62), 0.45) * lit * (0.56 + behind * 1.1) * (0.74 + 0.5 * fine) * (1.0 + 0.6 * spoke * behind);
  gl_FragColor = vec4(colour * density, density);
  ${FARAWAY} gl_FragColor *= arrive;
  #include <tonemapping_fragment>
  #include <colorspace_fragment>
}
`;

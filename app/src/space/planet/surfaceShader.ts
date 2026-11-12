// The Earth and its Moon, hand-made (ADR-0002 §3): their real maps drawn as they are, through the light every world shares. Every other
// world is generated (generatedShader.ts). A look is uniforms, never shader text.
import { FARAWAY, FIELD, LOOKUP } from "./chunks.ts";
import { LOW_SUN, shadowMarch } from "./shadowMarch.ts";
import { COMMON, PARTS, SHADE } from "./surfaceParts.ts";

/** How fast a world turns, in radians a second of its `time`. */
export const SPIN = 0.012;

export const SURFACE_VERTEX = /* glsl */ `
uniform vec3 sun;
varying vec3 vLocal;
varying vec3 vNormal;
varying vec3 vWorld;
varying vec3 vSun;
void main() {
  vLocal = position;
  vNormal = normalize(mat3(modelMatrix) * position);
  vec4 world = modelMatrix * vec4(position, 1.0);
  vWorld = world.xyz;
  vSun = normalize(transpose(mat3(modelMatrix)) * sun);
  gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
}
`;

// The Earth's own clouds, its real cloud map by threshold, and its shadows. A slope read from the map beside each point, a pixel away and
// no nearer than a texel, so the detail a pixel can carry is shaded and no finer, soft-clipped so a crater's rim never becomes a line.
const RELIEF = /* glsl */ `
uniform float cloudCover;
uniform float highClouds;
uniform float nightLights;
vec3 clouded(vec3 colour, vec3 high, float low, float shine, vec3 tint, out float cover) {
  cover = smoothstep(low - 0.1, low + 0.72, read(cloudMap, lookupOf(high)).r);
  float shadowed = smoothstep(low - 0.1, low + 0.72, read(cloudMap, lookupOf(normalize(high + spin * vSun * 0.016))).r);
  return cloudsOver(colour, cover, shadowed, shine, tint);
}
// A second, high layer: the same map read again, tilted and slower, thin and faint, with no shadow of its own, over the first.
vec3 highClouded(vec3 colour, vec3 axis, float shine, vec3 tint) {
  vec3 tilted = vec3(axis.x, axis.y * 0.8 + axis.z * 0.6, axis.z * 0.8 - axis.y * 0.6);
  vec3 high = spin * normalize(turned(tilted, -cloudTime * 0.0022) + 0.14 * field(tilted * 2.3).yzx);
  float cover = smoothstep(0.62, 1.02, read(cloudMap, lookupOf(high)).r);
  return mix(colour, tint * shine + 0.0015, cover * highClouds);
}
const float TEXEL = 0.0032;
const float REACH = 0.012;
// The real height map, once it came (heightOn, 0 to 1: it comes in over a moment): 0 to 1 above heightSea, as many radii as heightSpan (exaggerated).
uniform sampler2D heightMap;
uniform float heightOn;
uniform float heightSea;
uniform float heightSpan;
// Read with the centre's own derivatives, so it may sit in a branch that only some pixels take.
float groundAt(vec3 d, Lookup at) {
  return max(textureGrad(heightMap, uvOf(d), at.dx, at.dy).r - heightSea, 0.0) / (1.0 - heightSea);
}
${LOW_SUN}
${shadowMarch("shadowed", { steps: "6", soft: "0.2", extra: ", Lookup at", read: "groundAt(p, Lookup(at.uv, at.dx + vec2(1.0 * s / TAU, 0.0), at.dy + vec2(0.0, 1.0 * s / PI)))" })}
vec3 bumped(vec3 axis, float height, float angle, Lookup at, float ground, out float hollow) {
  hollow = 0.0;
  vec3 normal = normalize(vNormal);
  bool real = heightOn > 0.0;
  if (relief < 0.004 && !real) return normal;
  vec3 east = normalize(cross(vec3(0.0, 1.0, 0.0), axis));
  vec3 north = cross(axis, east);
  float reach = clamp(length(fwidth(axis)), TEXEL, REACH);
  vec3 toEast = spin * normalize(axis + east * reach);
  vec3 toNorth = spin * normalize(axis + north * reach);
  vec3 tilt = vec3(0.0);
  if (relief >= 0.004) {
    vec3 slope = (east * (toneOf(read(surface, lookupOf(toEast)).rgb) - height) + north * (toneOf(read(surface, lookupOf(toNorth)).rgb) - height)) / reach;
    slope /= 1.0 + 0.35 * length(slope);
    tilt = relief * mix(1.0, 0.5, heightOn) * slope;
  }
  if (real) {
    float east1 = groundAt(toEast, at);
    float north1 = groundAt(toNorth, at);
    vec3 slope = heightSpan * (east * (east1 - ground) + north * (north1 - ground)) / reach;
    tilt += heightOn * (slope / (1.0 + 3.0 * length(slope)));
    if (depth > 0.5)
      hollow = 0.25 * (east1 + north1 + groundAt(spin * normalize(axis - east * reach), at) + groundAt(spin * normalize(axis - north * reach), at)) - ground;
    hollow = clamp(6.0 * hollow * heightSpan / reach, 0.0, 1.0);
  }
  return normalize(normal - mat3(modelMatrix) * turned(tilt, -angle) / length(modelMatrix[0].xyz));
}
`;
// The Earth's own map holds its seas, where it is bluest; its clouds drift over it, and its cities come on across the arc the day goes out in.
export const SURFACE_FRAGMENT = /* glsl */ `
${COMMON}
${FIELD}
${LOOKUP}
${PARTS}
${SHADE}
${RELIEF}
void main() {
  float angle = time * ${String(SPIN)};
  vec3 axis = turned(normalize(vLocal), angle);
  vec3 flow = field(axis);
  vec3 direction = spin * normalize(axis);
  Lookup place = lookupOf(direction);
  vec3 base = read(surface, place).rgb;
  float height = toneOf(base);
  float pixel = length(fwidth(axis));
    vec3 albedo = base;
  float wet = 0.0;
  if (nightLights > 0.0) {
    wet = smoothstep(0.004, 0.02, base.b - max(base.r, base.g));
    if (heightOn > 0.0) {
      float code = read(heightMap, place).r;
      float edge = max(0.5 * fwidth(code), 0.01);
      wet = mix(wet, 1.0 - smoothstep(heightSea - edge, heightSea + edge, code), heightOn);
    }
    albedo = max(mix(vec3(dot(albedo, LUMA)), albedo, 0.66), SEA_FLOOR * wet);
  }
  vec3 normal = normalize(vNormal);
  float day = dot(normal, sun);
  vec3 view = normalize(cameraPosition - vWorld);
  float light;
  float shine;
  float hollow = 0.0;
  float lit = 1.0;
  float ground = heightOn > 0.0 ? groundAt(direction, place) : 0.0;
  vec3 bent = bumped(axis, height * (1.0 - wet), angle, place, ground, hollow);
  if (heightOn > 0.0 && depth > 0.5) {
    float close = 1.0 - smoothstep(0.004, 0.012, pixel);
    vec3 toSun = spin * turned(vSun, angle);
    float near = close * lowSun(dot(direction, toSun));
    if (near > 0.0) lit = mix(1.0, shadowed(direction, toSun, ground, heightSpan, place), near * heightOn);
    albedo *= 1.0 - 0.35 * hollow * heightOn * close * (1.0 - wet);
  }
  vec3 colour = shadowedBy(litBy(albedo, wet, bent, normal, view, light, shine), albedo, lit);
  float overcast = 0.0;
  if (cloudCover > 0.0) {
    vec3 high = spin * normalize(turned(axis, cloudTime * 0.006) + 0.09 * flow.yzx);
    colour = clouded(colour, high, 1.0 - cloudCover * 1.25, shine, vec3(0.84, 0.86, 0.9), overcast);
    if (highClouds > 0.0) colour = highClouded(colour, axis, shine, vec3(0.84, 0.86, 0.9));
  }
  if (nightLights > 0.0) {
    vec3 cities = read(nightMap, place).rgb;
    vec3 spill = textureLod(nightMap, place.uv, 3.5).rgb;
    float dusk = 1.0 - smoothstep(-0.16, 0.4, day);
    colour += (cities * 2.6 + spill * 0.9) * CITY_LIGHT * dusk * (1.0 - 0.8 * overcast);
  }
  colour = rimmed(colour, normal, view, day);
  gl_FragColor = vec4(colour, 1.0);
  ${FARAWAY} gl_FragColor.a = arrive;
  #include <tonemapping_fragment>
  #include <colorspace_fragment>
}
`;

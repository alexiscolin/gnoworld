// The Earth and its Moon, hand-made (ADR-0002 §3): their real maps drawn as they are, through the light every world shares. Every other
// world is generated (generatedShader.ts). A look is uniforms, never shader text.
import { FIELD, LOOKUP } from "./chunks.ts";
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
  gl_Position = projectionMatrix * viewMatrix * world;
}
`;

// The Earth's own clouds, its real cloud map by threshold, and its shadows. A slope read from the map beside each point, a pixel away and
// no nearer than a texel, so the detail a pixel can carry is shaded and no finer, soft-clipped so a crater's rim never becomes a line.
const RELIEF = /* glsl */ `
uniform float cloudCover;
uniform float nightLights;
vec3 clouded(vec3 colour, vec3 high, float low, float shine, vec3 tint, out float cover) {
  cover = smoothstep(low - 0.1, low + 0.72, read(cloudMap, lookupOf(high)).r);
  float shadowed = smoothstep(low - 0.1, low + 0.72, read(cloudMap, lookupOf(normalize(high + spin * vSun * 0.016))).r);
  return cloudsOver(colour, cover, shadowed, shine, tint);
}
const float TEXEL = 0.0032;
const float REACH = 0.012;
vec3 bumped(vec3 axis, float height, float angle) {
  vec3 normal = normalize(vNormal);
  if (relief < 0.004) return normal;
  vec3 east = normalize(cross(vec3(0.0, 1.0, 0.0), axis));
  vec3 north = cross(axis, east);
  float reach = clamp(length(fwidth(axis)), TEXEL, REACH);
  float toEast = toneOf(read(surface, lookupOf(spin * normalize(axis + east * reach))).rgb);
  float toNorth = toneOf(read(surface, lookupOf(spin * normalize(axis + north * reach))).rgb);
  vec3 slope = (east * (toEast - height) + north * (toNorth - height)) / reach;
  slope /= 1.0 + 0.35 * length(slope);
  return normalize(normal - relief * mat3(modelMatrix) * turned(slope, -angle) / length(modelMatrix[0].xyz));
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
  vec3 base = read(surface, lookupOf(direction)).rgb;
  float height = toneOf(base);
  vec3 albedo = base;
  float wet = 0.0;
  if (nightLights > 0.0) {
    wet = smoothstep(0.004, 0.02, base.b - max(base.r, base.g));
    albedo = max(mix(vec3(dot(albedo, LUMA)), albedo, 0.66), SEA_FLOOR * wet);
  }
  vec3 normal = normalize(vNormal);
  float day = dot(normal, sun);
  vec3 view = normalize(cameraPosition - vWorld);
  float light;
  float shine;
  vec3 colour = litBy(albedo, wet, bumped(axis, height * (1.0 - wet), angle), normal, view, light, shine);
  float overcast = 0.0;
  if (cloudCover > 0.0) {
    vec3 high = spin * normalize(turned(axis, cloudTime * 0.006) + 0.09 * flow.yzx);
    colour = clouded(colour, high, 1.0 - cloudCover * 1.25, shine, vec3(0.84, 0.86, 0.9), overcast);
  }
  if (nightLights > 0.0) {
    Lookup place = lookupOf(direction);
    vec3 cities = read(nightMap, place).rgb;
    vec3 spill = textureLod(nightMap, place.uv, 3.5).rgb;
    float dusk = 1.0 - smoothstep(-0.16, 0.4, day);
    colour += (cities * 2.6 + spill * 0.9) * CITY_LIGHT * dusk * (1.0 - 0.8 * overcast);
  }
  colour = rimmed(colour, normal, view, day);
  gl_FragColor = vec4(colour, 1.0);
  #include <tonemapping_fragment>
  #include <colorspace_fragment>
}
`;

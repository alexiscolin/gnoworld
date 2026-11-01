// A world's surface, one program for every world: a look is uniforms, never shader text (ADR-0002 §3, "a class is data"). The real map is
// warped at low frequency, recoloured through a ramp, flooded, frozen or cracked, then lit: dusty on airless worlds, soft on cloudy ones.
import { FIELD, LOOKUP, SEAMS } from "./chunks.ts";

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

const UNIFORMS = /* glsl */ `
uniform mat4 modelMatrix;
uniform sampler2D surface;
uniform sampler2D second;
uniform sampler2D cloudMap;
uniform sampler2D ringMap;
uniform mat3 spin;
uniform vec3 sun;
uniform vec3 warpOffset;
uniform vec3 rampLow;
uniform vec3 rampMid;
uniform vec3 rampHigh;
uniform vec3 seaShallow;
uniform vec3 seaDeep;
uniform vec3 glowColour;
uniform float time;
uniform float warpAmount;
uniform float warpFrequency;
uniform float secondShare;
uniform float recolour;
uniform float contrast;
uniform float relief;
uniform float limb;
uniform float caps;
uniform float cloudCover;
uniform float rifts;
uniform float cracks;
uniform float locked;
uniform float air;
uniform float seaLevel;
uniform float glowLevel;
uniform float ringInner;
uniform float ringOuter;
uniform float ringOpacity;
varying vec3 vLocal;
varying vec3 vNormal;
varying vec3 vWorld;
varying vec3 vSun;
`;

const PARTS = /* glsl */ `
const float SUN = 1.0;
const float TEXEL = 0.0032;
const vec3 LUMA = vec3(0.2126, 0.7152, 0.0722);

vec3 turned(vec3 v, float angle) {
  float c = cos(angle);
  float s = sin(angle);
  return vec3(c * v.x + s * v.z, v.y, c * v.z - s * v.x);
}

float toneOf(vec3 colour) {
  return sqrt(dot(colour, LUMA));
}

vec3 ramped(vec3 colour, float tone) {
  vec3 stop = tone < 0.5 ? mix(rampLow, rampMid, tone * 2.0) : mix(rampMid, rampHigh, tone * 2.0 - 1.0);
  float light = max(dot(colour, LUMA), 0.001);
  return mix(colour, stop * mix(vec3(1.0), colour / light, 0.22), recolour);
}

// A slope read from the map beside each point: screen derivatives step in blocks of two pixels, plain along a terminator.
vec3 bumped(vec3 axis, vec3 flow, float height, float angle) {
  vec3 normal = normalize(vNormal);
  if (relief < 0.004) return normal;
  vec3 east = normalize(cross(vec3(0.0, 1.0, 0.0), axis));
  vec3 north = cross(axis, east);
  float toEast = toneOf(read(surface, lookupOf(spin * normalize(axis + east * TEXEL + warpAmount * flow))).rgb);
  float toNorth = toneOf(read(surface, lookupOf(spin * normalize(axis + north * TEXEL + warpAmount * flow))).rgb);
  vec3 slope = (east * (toEast - height) + north * (toNorth - height)) / TEXEL;
  return normalize(normal - relief * mat3(modelMatrix) * turned(slope, -angle) / length(modelMatrix[0].xyz));
}

float ringShade() {
  if (ringOuter <= 0.0 || abs(vSun.y) < 0.001) return 1.0;
  float along = -vLocal.y / vSun.y;
  if (along <= 0.0) return 1.0;
  float reach = (length((vLocal + along * vSun).xz) - ringInner) / (ringOuter - ringInner);
  if (reach <= 0.0 || reach >= 1.0) return 1.0;
  return 1.0 - 0.85 * ringOpacity * textureLod(ringMap, vec2(reach, 0.5), 0.0).r;
}

float lines(vec3 at, float width) {
  return 1.0 - smoothstep(0.0, width, min(seams(at), seams(at * 2.3 + 11.0) * 2.0));
}

// One side always faces its star: scorched glass at the centre, desert, a thin belt of life, then ice to the far side.
vec3 eyeball(vec3 albedo, float tone, float day) {
  vec3 ice = mix(vec3(0.46, 0.58, 0.74), vec3(0.93, 0.96, 0.99), tone);
  vec3 cold = mix(ice, albedo * vec3(0.62, 0.78, 0.6), smoothstep(0.1, 0.3, day));
  vec3 warm = mix(cold, albedo, smoothstep(0.3, 0.48, day));
  return mix(warm, albedo * vec3(0.3, 0.2, 0.16), smoothstep(0.78, 0.97, day));
}
`;

export const SURFACE_FRAGMENT = /* glsl */ `
${UNIFORMS}
${FIELD}
${SEAMS}
${LOOKUP}
${PARTS}
void main() {
  float angle = time * 0.012;
  vec3 axis = turned(normalize(vLocal), angle);
  vec3 flow = field(axis * warpFrequency + warpOffset);
  vec3 direction = spin * normalize(axis + warpAmount * flow);
  vec3 base = read(surface, lookupOf(direction)).rgb;
  float height = toneOf(base);
  if (secondShare > 0.002) {
    float patchy = smoothstep(0.42, 0.86, field(axis * 1.3 + warpOffset.zxy).x * 0.5 + 0.5 + secondShare * 0.6 - 0.2);
    vec3 elsewhere = spin * normalize(turned(axis, 2.1) + warpAmount * flow.zxy);
    base = mix(base, read(second, lookupOf(elsewhere)).rgb, patchy * 0.72);
  }
  float tone = toneOf(base);
  if (contrast > 1.0) {
    float mean = toneOf(textureLod(surface, vec2(0.5), 12.0).rgb);
    base *= pow(max(1.0 + (tone - mean) * contrast / max(tone, 0.05), 0.02), 2.0);
    tone = clamp(mean + (tone - mean) * contrast, 0.0, 1.0);
  }
  vec3 albedo = ramped(base, tone);

  float wet = 0.0;
  if (seaLevel >= 0.0) {
    wet = 1.0 - smoothstep(seaLevel - 0.012, seaLevel + 0.012, tone);
    albedo = mix(albedo, mix(seaDeep, seaShallow, smoothstep(seaLevel - 0.16, seaLevel, tone)), wet);
  }
  if (caps > 0.0) {
    float frozen = smoothstep(1.0 - caps, 1.0 - caps + 0.05, abs(axis.y) + 0.07 * flow.y + 0.16 * (tone - 0.5));
    albedo = mix(albedo, vec3(0.86, 0.9, 0.95), frozen);
    wet *= 1.0 - frozen;
  }
  vec3 normal = normalize(vNormal);
  float day = dot(normal, sun);
  if (locked > 0.5) albedo = eyeball(albedo, tone, day);
  float crack = cracks > 0.0 ? lines(direction * 3.0 + 0.3 * flow, 0.012 + 0.02 * cracks) : 0.0;
  albedo = mix(albedo, vec3(0.42, 0.2, 0.11), crack * 0.82);
  float widen = 0.35 + 0.65 * smoothstep(-0.3, 0.5, flow.z);
  float rift = rifts > 0.0 ? lines(direction * 2.1 + 0.25 * flow, (0.012 + 0.05 * rifts) * widen) : 0.0;
  albedo *= 1.0 - 0.95 * rift;

  vec3 view = normalize(cameraPosition - vWorld);
  float light = max(dot(bumped(axis, flow, height * (1.0 - wet), angle), sun), 0.0) * smoothstep(-0.02, 0.1, day);
  float facing = max(dot(normal, view), 0.001);
  float dusty = 2.0 * light / (light + facing + 0.001) * smoothstep(0.0, 0.06, light);
  float soft = pow(light, 0.9) * pow(facing, 0.28);
  float shine = mix(dusty, soft, limb) * ringShade();
  vec3 sunlight = SUN * mix(mix(vec3(1.0), vec3(1.0, 0.56, 0.32), air), vec3(1.0), smoothstep(0.0, 0.26, light));
  vec3 colour = albedo * shine * sunlight + albedo * 0.002;

  float gleam = max(dot(normal, normalize(sun + view)), 0.0);
  float ripple = 0.55 + 0.45 * field(direction * 90.0).x;
  colour += wet * (pow(gleam, 900.0) * 0.9 + pow(gleam, 90.0) * 0.05) * ripple * smoothstep(0.0, 0.1, light) * vec3(1.0, 0.94, 0.84);

  if (cloudCover > 0.0) {
    vec3 high = spin * normalize(turned(axis, time * 0.006) + 0.09 * flow.yzx);
    float low = 1.0 - cloudCover * 1.25;
    float cover = smoothstep(low - 0.1, low + 0.72, read(cloudMap, lookupOf(high)).r);
    float shadowed = smoothstep(low - 0.1, low + 0.72, read(cloudMap, lookupOf(normalize(high + spin * vSun * 0.016))).r);
    colour *= 1.0 - 0.36 * shadowed;
    colour = mix(colour, vec3(0.84, 0.86, 0.9) * shine * sunlight + 0.0015, cover * 0.9);
  }
  if (glowLevel > 0.0) {
    float heat = rifts > 0.0 ? rift * rift * smoothstep(0.1, 0.8, flow.z + 0.4) : smoothstep(glowLevel, glowLevel + 0.1, tone);
    float burn = 0.4 + 1.3 * abs(field(direction * 2.4 + warpOffset).y);
    colour += mix(glowColour * glowColour, vec3(1.0, 0.78, 0.42), heat * heat * 0.7) * heat * burn * 2.0;
  }
  gl_FragColor = vec4(colour, 1.0);
  #include <tonemapping_fragment>
  #include <colorspace_fragment>
}
`;

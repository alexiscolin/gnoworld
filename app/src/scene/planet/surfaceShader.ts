// A world's surface, one program for every world: a look is uniforms, never shader text (ADR-0002 §3, "a class is data"). The real map is
// warped at low frequency, recoloured through a ramp, flooded, frozen or cracked, then lit: dusty on airless worlds, soft on cloudy ones.
import { FIELD, LOOKUP, SEAMS } from "./chunks.ts";
import { PARTS, UNIFORMS } from "./surfaceParts.ts";

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

export const SURFACE_FRAGMENT = /* glsl */ `
${UNIFORMS}
${FIELD}
${SEAMS}
${LOOKUP}
${PARTS}
void main() {
  float angle = time * ${String(SPIN)};
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
  // A real map holds its own seas: they are where it is bluest.
  if (nightLights > 0.0) {
    wet = smoothstep(0.004, 0.02, base.b - max(base.r, base.g));
    albedo = mix(max(mix(vec3(dot(albedo, LUMA)), albedo, 0.66), SEA_FLOOR * wet), albedo, 0.0);
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
  // Air spreads the terminator: dusk is a wide belt on the Earth, and on every world that has air.
  light = pow(light, 1.0 - 0.3 * air);
  float facing = max(dot(normal, view), 0.001);
  float dusty = 2.0 * light / (light + facing + 0.001) * smoothstep(0.0, 0.06, light);
  float soft = pow(light, 0.9) * pow(facing, 0.28);
  // The light falls off towards the terminator on every world, as the Earth's does, more where there is air, whatever the row says.
  float shine = mix(dusty, soft, max(limb, mix(SOFT_BARE, SOFT_AIR, air))) * ringShade();
  vec3 sunlight = SUN * mix(mix(vec3(1.0), vec3(1.0, 0.56, 0.32), air), vec3(1.0), smoothstep(0.0, 0.26, light));
  vec3 colour = albedo * shine * sunlight + albedo * NIGHT;

  float gleam = max(dot(normal, normalize(sun + view)), 0.0);
  float ripple = 0.8 + 0.2 * field(direction * 14.0).x;
  float glitter = nightLights > 0.0 ? pow(gleam, 60.0) * 0.05 : (pow(gleam, 260.0) * 1.1 + pow(gleam, 40.0) * 0.1) * ripple;
  colour += wet * glitter * smoothstep(0.0, 0.1, light) * vec3(1.0, 0.94, 0.84);

  float overcast = 0.0;
  if (cloudCover > 0.0) {
    vec3 high = spin * normalize(turned(axis, time * 0.006) + 0.09 * flow.yzx);
    float low = 1.0 - cloudCover * 1.25;
    float cover = smoothstep(low - 0.1, low + 0.72, read(cloudMap, lookupOf(high)).r);
    float shadowed = smoothstep(low - 0.1, low + 0.72, read(cloudMap, lookupOf(normalize(high + spin * vSun * 0.016))).r);
    colour *= 1.0 - 0.36 * shadowed;
    colour = mix(colour, vec3(0.84, 0.86, 0.9) * shine * sunlight + 0.0015, cover * 0.9);
    overcast = cover;
  }
  if (nightLights > 0.0) {
    Lookup place = lookupOf(direction);
    vec3 cities = read(nightMap, place).rgb;
    vec3 spill = textureLod(nightMap, place.uv, 3.5).rgb;
    float dusk = 1.0 - smoothstep(-0.14, 0.05, day);
    colour += (cities * 2.6 + spill * 0.9) * vec3(1.0, 0.8, 0.52) * dusk * (1.0 - 0.8 * overcast);
  }
  float rim = pow(1.0 - facing, 2.4) * smoothstep(-0.05, 0.4, day);
  // Air lifts the day side's edge into its own colour; no air, a thin edge of sunlight only.
  if (air > 0.5) colour = mix(colour, hazeColour, rim * hazeAmount);
  else colour += EDGE * sunlight * pow(1.0 - facing, 5.0) * smoothstep(0.02, 0.5, day);
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

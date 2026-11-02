// What a world's signs add to its render, and only ever add: lights on its night side, in the form its class gives them, off until a stage
// asks. Every form reads the Earth's real night map, warped by the seed as a world's day map is, twice where a world has no sea, so a settled
// world's lights hold a city's detail at any size. The derivatives are all taken before `settlements` skips a day pixel, a branch that varies.
import { LIGHT_KINDS, type LightKind } from "@gnoworld/core";

/** The number a kind of light goes by in the shader. */
export const lightCode = (kind: LightKind): number => LIGHT_KINDS.indexOf(kind);

const code = (kind: LightKind) => `${String(lightCode(kind))}.0`;

export const LIGHT_UNIFORMS = /* glsl */ `
uniform float settled;
uniform float lightLevel;
uniform float lightKind;
uniform float lightGrain;
uniform float lightFine;
uniform float lightTurn;
uniform vec3 lightOffset;
`;

export const LIGHTS = /* glsl */ `
// The Earth's own lights, the frames' warm family: a form varies, a colour does not.
const vec3 CITY_LIGHT = vec3(1.0, 0.8, 0.52);

// Regions open out of a low-frequency field as a world settles, about a share of its surface for a share of settled.
float settledAt(vec3 axis) {
  float ground = smoothstep(-0.7, 0.7, field(axis * lightGrain + lightOffset).x);
  return smoothstep(ground, ground + 0.2, settled * 1.22);
}

// A seam's line, its pixel's size taken ahead, for past the skip below no fwidth holds. One scale alone: a finer one under a pixel would shimmer.
float seamAt(vec3 at, float pixel) {
  return 1.0 - smoothstep(0.0, max(0.014, 1.1 * pixel), seams(at));
}

// A golden net, a soft glow once a pixel holds more than a few of its cells: a line would break into worms.
float netOf(vec3 direction, vec3 flow, vec3 lit) {
  float wired = 0.24 + 0.6 * abs(field(direction * 4.0 + lightOffset).y) + 1.1 * lit.x;
  float line = seamAt(direction * lightFine + 0.3 * flow, lit.z);
  return mix(line * wired, 0.08 + lit.y, smoothstep(0.03, 0.12, lit.z));
}

// The shape a class gives its lights, from the map's cities and its soft spill.
float formOf(vec3 axis, vec3 direction, vec3 flow, vec4 reads, float crack) {
  float cities = reads.x;
  float spill = reads.y;
  float strung = cities * 2.4 + spill * 2.2;
  if (lightKind == ${code("seams")}) return netOf(direction, flow, vec3(strung, spill, reads.w));
  if (lightKind == ${code("cracks")}) {
    return crack * (0.08 + 0.24 * abs(field(direction * 4.0 + lightOffset).y) + strung) * 1.6 * lightFine;
  }
  if (lightKind == ${code("belts")}) return smoothstep(0.45, 0.95, sin(axis.y * lightFine + lightOffset.x)) * (cities * 16.0 + spill * 0.5);
  if (lightKind == ${code("pools")}) {
    float soft = spill / (spill + 0.05);
    return 0.1 * soft + 0.6 * soft * soft * soft + cities * 1.2;
  }
  if (lightKind == ${code("dusk")}) return (1.0 - smoothstep(0.02, lightFine, abs(reads.z + 0.05))) * strung * 1.6;
  if (lightKind == ${code("towns")}) return cities * 2.6 + spill * 1.8 * lightFine;
  return (cities * 2.6 + spill * 1.2) * lightFine;
}

// A world's lights, on the arc its night comes on across, the Earth's level for level. The map holds one channel, squared here into light.
vec3 settlements(vec3 axis, vec3 direction, vec3 flow, float day, float crack) {
  vec3 place = lightTurn == 0.0 ? direction : spin * normalize(turned(axis, lightTurn) + warpAmount * flow);
  Lookup at = lookupOf(place);
  Lookup other = at;
  if (lightTurn != 0.0) other = lookupOf(place.zxy);
  float pixel = 0.5 * length(fwidth(direction)) * lightFine;
  float night = 1.0 - smoothstep(-0.16, 0.4, day);
  float open = night > 0.0 ? settledAt(axis) : 0.0;
  if (open <= 0.0) return vec3(0.0);
  float blur = lightKind == ${code("pools")} ? lightFine : 3.5;
  float cities = max(read(nightMap, at).r, read(nightMap, other).r);
  float spill = max(textureLod(nightMap, at.uv, blur).r, textureLod(nightMap, other.uv, blur).r);
  float form = formOf(axis, direction, flow, vec4(cities * cities, spill * spill * 2.5, day, pixel), crack);
  return CITY_LIGHT * form * open * lightLevel * night;
}
`;

export const HALO_VERTEX = /* glsl */ `
varying vec3 vNormal;
varying vec3 vView;
void main() {
  vec4 world = modelMatrix * vec4(position, 1.0);
  vNormal = normalize(mat3(modelMatrix) * position);
  vView = normalize(cameraPosition - world.xyz);
  gl_Position = projectionMatrix * viewMatrix * world;
}
`;

// The colours of the "Uncharted signal" of frame 4: a pink heart in a deep red glow, no sun's and no heat's.
export const HALO_FRAGMENT = /* glsl */ `
uniform float signal;
varying vec3 vNormal;
varying vec3 vView;
void main() {
  float centre = abs(dot(normalize(vNormal), normalize(vView)));
  vec3 glow = mix(vec3(0.4, 0.05, 0.07), vec3(0.95, 0.56, 0.74), pow(centre, 18.0));
  // The heart covers the small body, so no limb shows through.
  float cover = smoothstep(0.82, 0.96, centre);
  gl_FragColor = vec4(glow * pow(centre, 4.0) * signal * 0.62, cover);
  #include <tonemapping_fragment>
  #include <colorspace_fragment>
}
`;

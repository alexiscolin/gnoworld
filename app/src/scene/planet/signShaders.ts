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

// Outside the shader, as a comment in it ships: settledAt opens regions where the map's lights are densest, then out
// across the field; netOf is a golden net with a copper glow, soft under a few pixels; formOf is a class's shape; settlements is the whole
// night, a net's world glowing copper between its cells as it settles, so a lit patch never floats on a black body.
export const LIGHTS = /* glsl */ `
float settledAt(vec3 axis, float spill) {
  float ground = smoothstep(-0.7, 0.7, field(axis * lightGrain + lightOffset).x);
  float rank = 0.6 * (1.0 - smoothstep(0.0, 0.15, spill)) + 0.4 * ground - 0.1;
  return smoothstep(rank, rank + 0.15, settled * 1.15);
}

float netOf(vec3 direction, vec2 seam, vec3 lit) {
  float wired = 0.3 + 0.36 * abs(field(direction * 4.0 + lightOffset).y) + 0.7 * lit.x;
  return mix(seam.x * wired + 0.16 * seam.y * seam.y, 0.1 + 0.4 * lit.y, smoothstep(0.25, 0.5, lit.z));
}

float formOf(vec3 axis, vec3 direction, vec4 reads, vec3 lines) {
  float cities = reads.x;
  float spill = reads.y;
  float crack = lines.z;
  float strung = cities * 2.4 + spill * 2.2;
  if (lightKind == ${code("seams")}) return netOf(direction, lines.xy, vec3(strung, spill, reads.w));
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

vec3 settlements(vec3 axis, vec3 direction, vec3 flow, float day, float crack) {
  vec3 place = lightTurn == 0.0 ? direction : spin * normalize(turned(axis, lightTurn) + warpAmount * flow);
  Lookup at = lookupOf(place);
  Lookup other = at;
  if (lightTurn != 0.0) other = lookupOf(place.zxy);
  float pixel = 0.5 * length(fwidth(direction)) * lightFine;
  vec2 seam = vec2(0.0);
  if (lightKind == ${code("seams")}) {
    float away = seams(direction * lightFine + 0.3 * flow);
    seam = vec2(1.0 - smoothstep(0.0, 2.2 * max(fwidth(away), 0.5 * pixel), away), 1.0 - smoothstep(0.0, 0.2, away));
  }
  float night = 1.0 - smoothstep(-0.16, 0.4, day);
  if (night <= 0.0) return vec3(0.0);
  float blur = lightKind == ${code("pools")} ? lightFine : 3.5;
  float cities = max(read(nightMap, at).r, read(nightMap, other).r);
  float spill = max(textureLod(nightMap, at.uv, blur).r, textureLod(nightMap, other.uv, blur).r);
  float open = settledAt(axis, spill);
  float form = formOf(axis, direction, vec4(cities * cities, spill * spill * 2.5, day, pixel), vec3(seam, crack));
  vec3 tint = lightKind == ${code("seams")} ? CITY_LIGHT * CITY_LIGHT : CITY_LIGHT;
  vec3 ground = lightKind == ${code("seams")} ? CITY_LIGHT * CITY_LIGHT * CITY_LIGHT * 0.025 * settled : vec3(0.0);
  return (tint * form * open + ground) * lightLevel * night;
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
// The heart (a comment here, not in the shader, which ships) covers the small body, whose edge falls near 0.92, so no limb shows through.
export const HALO_FRAGMENT = /* glsl */ `
uniform float signal;
varying vec3 vNormal;
varying vec3 vView;
void main() {
  float centre = abs(dot(normalize(vNormal), normalize(vView)));
  vec3 glow = mix(vec3(0.4, 0.05, 0.07), vec3(0.95, 0.56, 0.74), pow(centre, 30.0));
  float cover = smoothstep(0.82, 0.92, centre);
  gl_FragColor = vec4(glow * (0.42 * pow(centre, 4.0) + 0.42 * pow(centre, 30.0)) * signal, cover);
  #include <tonemapping_fragment>
  #include <colorspace_fragment>
}
`;

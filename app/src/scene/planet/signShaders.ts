// What a world's signs add to its render, and only ever add: lights on its night side, in the form its class gives them, off until a stage
// asks. Every form is one read of the Earth's real night map, warped by the seed as a world's day map is, so a settled world's lights hold
// a city's detail at any size. `lightKind` is a uniform and `settled` gates the block, so the derivatives here stay in uniform control flow.
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

// Regions open out of a low-frequency field as a world settles, until the whole of it is open at 1.
float settledAt(vec3 axis) {
  float ground = 0.5 + 0.8 * field(axis * lightGrain + lightOffset).x;
  return smoothstep(ground, ground + 0.12, settled * 1.3);
}

// The shape a class gives its lights, from the map's cities and its soft spill, and the fissures the world already drew where it has some.
float formOf(vec3 axis, vec3 direction, vec3 flow, vec3 reads, float fissure) {
  float cities = reads.x;
  float spill = reads.y;
  float day = reads.z;
  float strung = cities * 2.4 + spill * 2.2;
  float wired = 0.24 * abs(field(direction * 4.0 + lightOffset).y) + 0.08 + strung;
  if (lightKind == ${code("cracks")}) return fissure * wired * 1.6 * lightFine;
  if (lightKind == ${code("seams")}) return lines(direction * lightFine + 0.3 * flow, 0.008) * wired * 0.6;
  if (lightKind == ${code("belts")}) return smoothstep(0.7, 0.97, sin(axis.y * lightFine + lightOffset.x)) * (cities * 7.0 + spill * 2.4);
  if (lightKind == ${code("pools")}) return 0.34 * spill / (spill + 0.07);
  if (lightKind == ${code("dusk")}) return (1.0 - smoothstep(0.02, lightFine, abs(day + 0.05))) * strung * 1.6;
  if (lightKind == ${code("towns")}) return cities * 2.6 + spill * 1.8 * lightFine;
  return (cities * 2.6 + spill * 1.2) * lightFine;
}

// A world's lights, on the arc its night comes on across, the Earth's level for level. A map read twice on a world with no sea: its own seas would leave whole sides dark.
vec3 settlements(vec3 axis, vec3 direction, vec3 flow, float day, float fissure) {
  vec3 place = lightTurn == 0.0 ? direction : spin * normalize(turned(axis, lightTurn) + warpAmount * flow);
  float blur = lightKind == ${code("pools")} ? lightFine : 3.5;
  Lookup at = lookupOf(place);
  float cities = read(nightMap, at).r;
  float spill = textureLod(nightMap, at.uv, blur).r;
  if (lightTurn != 0.0) {
    Lookup other = lookupOf(place.zxy);
    cities = max(cities, read(nightMap, other).r);
    spill = max(spill, textureLod(nightMap, other.uv, blur).r);
  }
  float night = 1.0 - smoothstep(-0.16, 0.4, day);
  float form = formOf(axis, direction, flow, vec3(cities, spill, day), fissure);
  return CITY_LIGHT * form * settledAt(axis) * lightLevel * night;
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
  vec3 glow = mix(vec3(0.42, 0.07, 0.09), vec3(0.95, 0.62, 0.82), pow(centre, 12.0));
  gl_FragColor = vec4(glow * pow(centre, 5.0) * signal * 0.3, 1.0);
  #include <tonemapping_fragment>
  #include <colorspace_fragment>
}
`;

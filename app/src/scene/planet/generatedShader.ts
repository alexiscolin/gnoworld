// Every world but the Earth, one program (ADR-0002 §3, "a class is data"): its ground generated from 7b4's recipe, real maps lending
// their fine contrast only, lit with the Earth's own light. Comments live here, out of the strings that ship (the scene's budget).
import { FIELD, LOOKUP, SEAMS } from "./chunks.ts";
import { DETAIL, FORMS, NOISE } from "./generatedParts.ts";
import { LIGHT_UNIFORMS, LIGHTS } from "./signShaders.ts";
import { COMMON, PARTS, SHADE } from "./surfaceParts.ts";
import { SPIN } from "./surfaceShader.ts";

// The recipe's surface as one struct, each field a value of `SURFACE` by its own name: `mix` is GLSL's own word, so no plain uniform.
const UNIFORMS = /* glsl */ `
struct Shape {
  float scale; float lacunarity; float roughness; float warp; float erosion; float craters; float sea; float caps; float rifts;
  float bands; float turbulence; float storms; float clouds; float drift; float detail; float halves; float mix; float octaves;
};
uniform Shape shape;
uniform sampler2D minorMap;
uniform vec3 offset;
uniform vec3 minorOffset;
uniform vec3 low;
uniform vec3 mid;
uniform vec3 high;
uniform vec3 minorLow;
uniform vec3 minorMid;
uniform vec3 minorHigh;
uniform vec3 seaShallow;
uniform vec3 seaDeep;
uniform vec3 glowColour;
uniform float minorShare;
uniform float warpAmount;
uniform float warpFrequency;
uniform float recolour;
uniform float banded;
uniform float locked;
uniform float glowLevel;
`;

export const GENERATED_FRAGMENT = /* glsl */ `
${COMMON}
${UNIFORMS}
${LIGHT_UNIFORMS}
${FIELD}
${SEAMS}
${LOOKUP}
${PARTS}
${NOISE}
${FORMS}
${DETAIL}
${SHADE}
${LIGHTS}
void main() {
  float angle = time * ${String(SPIN)};
  vec3 axis = turned(normalize(vLocal), angle);
  vec3 at = spin * axis;
  float pixel = length(fwidth(axis));
  vec3 flow = field(axis * warpFrequency + offset);
  vec3 direction = spin * normalize(axis + warpAmount * flow);
  Lookup place = lookupOf(direction);
  Lookup elsewhere = lookupOf(spin * normalize(turned(axis, 2.1) + warpAmount * flow.zxy));
  vec3 own = detailOf(surface, place);
  vec3 other = detailOf(minorMap, elsewhere);

  float minor = 0.0;
  if (minorShare > 0.002) {
    vec3 along = banded > 0.5 ? vec3(at.x, at.y * 3.0, at.z) : at;
    float region = shareOf(fbm(along + minorOffset, shape.mix, pixel, 0.0, 3.0).xy);
    float edge = min(0.08, minorShare * 0.5);
    minor = smoothstep(1.0 - minorShare - edge, 1.0 - minorShare + edge, region);
  }
  float height = 0.0;
  float relieved = 0.0;
  float cratered = 0.0;
  float t;
  vec3 swirled = at;
  if (banded > 0.5) {
    swirled = shape.storms > 0.0 ? stormed(at) : at;
    t = clamp(bandsAt(swirled, pixel), 0.0, 1.0);
  } else {
    vec3 p = at + shape.warp * field(at * 1.1 + offset.yzx) + offset;
    vec3 ground = fbm(p, shape.scale, pixel, shape.erosion, shape.octaves);
    cratered = shape.craters > 0.0 ? cratersAt(p, shape.scale * 4.0, pixel) + 0.5 * cratersAt(p, shape.scale * 13.0, pixel) : 0.0;
    t = shareOf(ground.xy);
    height = ground.x / ground.y + cratered * 0.8;
    relieved = ground.z / ground.y + cratered * 0.8;
  }
  vec3 detail = mix(own, other, minor * (1.0 - banded));
  float fine = dot(detail, LUMA) - 1.0;
  height += fine * shape.detail * 2.0;
  relieved += fine * shape.detail * 0.3;
  float wet = 0.0;
  if (shape.sea > 0.0) {
    float coast = max(fwidth(t), 0.002);
    wet = 1.0 - smoothstep(shape.sea - coast, shape.sea + coast, t);
    t = clamp((t - shape.sea) / max(1.0 - shape.sea, 0.001), 0.0, 1.0);
  }
  float tint = mix(0.7, t, 0.8);
  vec3 albedo = mix(rampOf(low, mid, high, tint), rampOf(minorLow, minorMid, minorHigh, tint), minor);
  if (banded > 0.5) albedo = mix(albedo, mid, shape.clouds * 0.3) * (1.0 + (0.09 + 0.12 * shape.turbulence) * streaksAt(swirled, pixel));
  albedo *= mix(vec3(1.0), detail, min(shape.detail * 2.0, 1.0)) * (1.0 + 0.25 * clamp(cratered, -1.0, 1.0));
  if (shape.sea > 0.0) {
    float depth = smoothstep(0.0, 0.6, (shape.sea - shareOf(vec2(height, 1.0))) / shape.sea);
    albedo = mix(albedo, mix(seaShallow, seaDeep, depth), wet);
  }
  if (shape.caps > 0.0) {
    float pole = abs(axis.y) + 0.12 * flow.y + 0.12 * (t - 0.5);
    albedo = mix(albedo, mix(vec3(0.86, 0.9, 0.95), high, 0.35) * detail, smoothstep(1.0 - shape.caps, 1.0 - shape.caps + 0.03, pole));
  }
  if (shape.halves > 0.0) albedo *= 1.0 - shape.halves * smoothstep(-0.12, 0.12, axis.x + 0.18 * field(at * 2.0 + minorOffset).x);
  float rift = 0.0;
  if (shape.rifts > 0.0) {
    float riven = smoothstep(1.0 - shape.rifts, 1.2 - shape.rifts, shareOf(fbm(at * 1.3 + minorOffset.zxy, 1.5, pixel, 0.0, 2.0).xy));
    if (riven > 0.0) rift = lines(at * 2.1 + 0.35 * flow, 0.004 + 0.012 * shape.rifts, 2.3 * pixel) * riven;
  }
  albedo = mix(albedo, low * 0.6, rift * 0.7);

  vec3 normal = normalize(vNormal);
  float day = dot(normal, sun);
  if (locked > 0.5) albedo = eyeball(albedo, t, day);
  vec3 view = normalize(cameraPosition - vWorld);
  float world = length(modelMatrix[0].xyz);
  vec3 bent = bentBy(relieved * (1.0 - wet) * relief * world, normal);
  float light;
  float shine;
  vec3 colour = litBy(albedo, wet, bent, normal, view, light, shine);

  float overcast = 0.0;
  if (shape.clouds > 0.0 && banded < 0.5) {
    vec3 sky = spin * normalize(turned(axis, cloudTime * 0.006 * shape.drift) + 0.09 * flow.yzx);
    float cover = shape.clouds * 1.25 + 0.2 * field(at * 1.6 + minorOffset).x;
    colour = clouded(colour, sky, 1.0 - cover, shine, vec3(0.84, 0.86, 0.9), overcast);
  }
  if (settled > 0.0) colour += settlements(axis, direction, flow, day, rift) * (1.0 - 0.8 * overcast);
  colour = rimmed(colour, normal, view, day);
  if (glowLevel > 0.0) {
    float hot = 1.0 - (1.0 - glowLevel) * 0.2;
    float crackle = (noise(at * shape.scale * 9.0 + offset) + 0.5 * noise(at * shape.scale * 29.0 + offset.yzx)) / SPREAD;
    float vents = smoothstep(hot, hot + 0.06, shareOf(vec2(height + 0.9 * crackle, 1.3)));
    float heat = max(rift * rift * smoothstep(0.5, 0.8, shape.rifts) * smoothstep(0.1, 0.8, flow.z + 0.4), vents);
    float burn = 0.4 + 1.3 * abs(field(direction * 2.4 + offset).y);
    colour += mix(glowColour * glowColour, vec3(1.0, 0.78, 0.42), heat * heat * 0.7) * heat * burn * 2.0;
  }
  if (air > 0.5) colour = nightAir(colour, albedo, light);
  gl_FragColor = vec4(colour, 1.0);
  #include <tonemapping_fragment>
  #include <colorspace_fragment>
}
`;

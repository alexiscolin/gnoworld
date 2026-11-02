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
uniform float style;
uniform vec3 sulfurLow;
uniform vec3 sulfurMid;
uniform vec3 sulfurHigh;
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
  vec3 own = detailOf(surface, place);
  vec3 other = own;
  if (minorShare > 0.002 && banded < 0.5) {
    Lookup elsewhere = lookupOf(spin * normalize(turned(axis, 2.1) + warpAmount * flow.zxy));
    other = detailOf(minorMap, elsewhere);
  }

  float height = 0.0;
  float broad = 0.0;
  float fray = 0.0;
  float relieved = 0.0;
  float cratered = 0.0;
  float t;
  vec3 swirled = at;
  if (banded > 0.5) {
    swirled = shape.storms > 0.0 ? stormed(at) : at;
    t = clamp(bandsAt(swirled, pixel), 0.0, 1.0);
  } else {
    vec3 p = at + shape.warp * field(at * 1.1 + offset.yzx) + offset;
    vec4 ground = fbm(p, shape.scale, pixel, shape.erosion, shape.octaves);
    float big = shape.craters > 0.0 ? cratersAt(p, shape.scale * 4.0, pixel) : 0.0;
    cratered = shape.craters > 0.0 ? big + 0.5 * cratersAt(p, shape.scale * 13.0, pixel) : 0.0;
    t = shareOf(ground.wy);
    broad = ground.z / ground.y;
    fray = (ground.x - ground.z) / ground.y;
    height = ground.x / ground.y + cratered * 0.8;
    relieved = ground.z / ground.y + big * 0.8 * (1.0 - smoothstep(0.04, 0.08, shape.scale * 4.0 * pixel));
  }
  float minor = 0.0;
  if (minorShare > 0.002) {
    vec3 along = banded > 0.5 ? vec3(at.x, at.y * 3.0, at.z) : at;
    vec4 patches = fbm(along + minorOffset, shape.mix, pixel, 0.0, 3.0);
    float pole = (abs(axis.y) - 0.5) * 3.46 * sign(minorOffset.x - 8.0);
    float z = (patches.x / patches.y + 0.7 * broad + 0.4 * pole) * 0.77 + 1.2 * fray;
    if (banded > 0.5) z = (0.4 * patches.x / patches.y + (t - 0.5) * 3.5) * 0.93;
    minor = smoothstep(1.0 - minorShare - 0.03, 1.0 - minorShare + 0.03, shareOf(vec2(z, 1.0)));
  }
  vec3 detail = mix(own, other, minor);
  float fine = dot(detail, LUMA) - 1.0;
  height += fine * shape.detail * 2.0;
  float molten = 0.0;
  if (glowLevel > 0.0) {
    float crackle = (noise(at * shape.scale * 9.0 + offset) * fadeAt(shape.scale * 9.0, pixel) + 0.5 * noise(at * shape.scale * 29.0 + offset.yzx) * fadeAt(shape.scale * 29.0, pixel)) / SPREAD;
    molten = shareOf(vec2(0.35 * crackle - height, 1.3));
  }
  float wet = 0.0;
  if (shape.sea > 0.0) {
    float coast = max(fwidth(t), 0.002);
    wet = 1.0 - smoothstep(shape.sea - coast, shape.sea + coast, t);
    t = clamp((t - shape.sea) / max(1.0 - shape.sea, 0.001), 0.0, 1.0);
  }
  float tint = mix(0.7, t, 0.8);
  vec3 major = rampOf(low, mid, high, tint);
  vec3 second = rampOf(minorLow, minorMid, minorHigh, tint);
  if (glowLevel > 0.0 || banded > 0.5) second *= mix(1.0, dot(major, LUMA) / max(dot(second, LUMA), 1e-4), glowLevel > 0.0 ? 1.0 : 0.6);
  vec3 albedo = mix(major, second, minor);
  if (style > 1.5) albedo = rampOf(sulfurLow, sulfurMid, sulfurHigh, tint);
  if (banded > 0.5) albedo = mix(albedo, mid, shape.clouds * 0.3) * (1.0 + (0.09 + 0.12 * shape.turbulence) * streaksAt(swirled, pixel));
  albedo *= mix(vec3(1.0), detail, min(shape.detail * 2.0, 1.0)) * (1.0 + 0.25 * clamp(cratered, -1.0, 1.0));
  if (style > 1.5) albedo = mix(albedo, sulfurLow * 0.15, smoothstep(0.93, 0.96, molten));
  if (shape.sea > 0.0) {
    float depth = smoothstep(0.0, 0.6, (shape.sea - shareOf(vec2(height, 1.0))) / shape.sea);
    albedo = mix(albedo, mix(seaShallow, seaDeep, depth), wet);
  }
  if (shape.caps > 0.0) {
    float pole = abs(axis.y) + 0.3 * (t - 0.5) + 0.15 * flow.y;
    albedo = mix(albedo, mix(vec3(0.86, 0.9, 0.95), high, 0.35) * detail, smoothstep(1.0 - shape.caps, 1.0 - shape.caps + 0.06, pole));
  }
  if (shape.halves > 0.0) albedo *= 1.0 - shape.halves * smoothstep(-0.12, 0.12, axis.x + 0.18 * field(at * 2.0 + minorOffset).x);
  float rift = 0.0;
  if (shape.rifts > 0.0) {
    float riven = smoothstep(0.0, 0.15, shape.rifts);
    if (glowLevel > 0.0) riven *= smoothstep(0.08, 0.2, shape.craters);
    float ridge = 0.0;
    if (riven > 0.0) rift = lines(ridge, at, 0.008 + 0.02 * shape.rifts, pixel) * riven;
    relieved += 0.4 * ridge * riven;
    vec3 riftTint = mix(low * 0.6, vec3(0.42, 0.2, 0.11), smoothstep(0.12, 0.3, dot(mid, LUMA)));
    albedo = mix(albedo, riftTint, rift * 0.75);
    albedo *= 1.0 + 0.3 * max(ridge, 0.0) * riven;
  }

  vec3 normal = normalize(vNormal);
  float day = dot(normal, sun);
  if (locked > 0.5) albedo = eyeball(albedo, t, day);
  vec3 view = normalize(cameraPosition - vWorld);
  float world = length(modelMatrix[0].xyz);
  vec3 bent = bentBy(relieved * (1.0 - wet) * relief * world, normal);
  float near = 1.0 - smoothstep(0.004, 0.008, pixel);
  if (banded < 0.5 && near > 0.0) bent = grained(bent, normalize(axis + warpAmount * flow), dot(own, LUMA), clamp(pixel, 0.0032, 0.012), relief * min(shape.detail * 2.0, 1.0) * (1.0 - wet) * near, angle);
  float light;
  float shine;
  vec3 colour = litBy(albedo, wet, bent, normal, view, light, shine);

  float overcast = 0.0;
  if (shape.clouds > 0.0 && banded < 0.5) {
    vec3 sky = spin * normalize(turned(axis, cloudTime * 0.006 * shape.drift) + 0.09 * flow.yzx);
    float low = 1.0 - shape.clouds * 1.25;
    float grain = cloudGrain(lookupOf(sky));
    float cover = smoothstep(low - 0.1, low + 0.72, skyAt(sky, pixel));
    float shadowed = smoothstep(low - 0.1, low + 0.72, skyAt(normalize(sky + spin * vSun * 0.016), pixel));
    colour = cloudsOver(colour, cover, shadowed, shine, vec3(0.84, 0.86, 0.9) * mix(1.0, grain, 0.5));
    overcast = cover;
  }
  if (settled > 0.0) colour += settlements(axis, direction, flow, day, rift) * (1.0 - 0.8 * overcast);
  colour = rimmed(colour, normal, view, day);
  if (glowLevel > 0.0) {
    float hot = 1.0 - (1.0 - glowLevel) * 0.2;
    float vents = style > 1.5 ? smoothstep(0.985, 0.995, molten) : smoothstep(hot - 0.11, hot + 0.06, molten);
    float heat = mix(vents, rift * smoothstep(0.1, 0.8, flow.z + 0.4), smoothstep(0.08, 0.2, shape.craters));
    float burn = 0.4 + 1.3 * abs(field(direction * 2.4 + offset).y);
    vec3 glow = mix(glowColour * glowColour, vec3(1.0, 0.78, 0.42), heat * heat * 0.7) * heat * burn * 2.0;
    if (style > 0.5 && style < 1.5) glow = goldOf(veinsAt(at, pixel), burn);
    colour += glow;
  }
  if (air > 0.5) colour = nightAir(colour, albedo, light);
  gl_FragColor = vec4(colour, 1.0);
  #include <tonemapping_fragment>
  #include <colorspace_fragment>
}
`;

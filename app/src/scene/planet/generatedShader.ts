// Every world but the Earth, one program (ADR-0002 §3, "a class is data"): its ground generated from 7b4's recipe, real maps lending
// their fine contrast only, lit with the Earth's own light. Comments live here, out of the strings that ship (the scene's budget).
import { CONTINENTS_SEA } from "@gnoworld/core";
import { FARAWAY, FIELD, LOOKUP, SEAMS } from "./chunks.ts";
import { CRACKS } from "./generatedCracks.ts";
import { DETAIL, FORMS, NOISE } from "./generatedParts.ts";
import { LIGHT_UNIFORMS, LIGHTS } from "./signShaders.ts";
import { COMMON, PARTS, SHADE } from "./surfaceParts.ts";
import { SPIN } from "./surfaceShader.ts";

// The recipe's surface as one struct, each field a value of `SURFACE` by its own name: `mix` is GLSL's own word, so no plain uniform.
const UNIFORMS = /* glsl */ `
struct Shape {
  float scale, lacunarity, roughness, warp, erosion, craters, sea, caps, rifts;
  float bands, turbulence, storms, clouds, drift, detail, halves, mix, gather, octaves;
};
uniform Shape shape;
uniform sampler2D minorMap;
uniform vec3 offset, minorOffset, low, mid, high, minorLow, minorMid, minorHigh, seaShallow, seaDeep, glowColour;
uniform vec3 sulfurLow, sulfurMid, sulfurHigh;
uniform float minorShare, warpAmount, warpFrequency, recolour, banded, locked, glowLevel, style, grooved;
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
${CRACKS}
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
  bool continents = shape.sea > 0.0 && shape.sea < ${String(CONTINENTS_SEA)};
  if (minorShare > 0.002 && banded < 0.5 && !continents) {
    Lookup elsewhere = lookupOf(spin * normalize(turned(axis, 2.1) + warpAmount * flow.zxy));
    other = detailOf(minorMap, elsewhere);
  }

  float height = 0.0;
  float broad = 0.0;
  float fray = 0.0;
  float relieved = 0.0;
  float inland = 1.0;
  float cratered = 0.0;
  float t;
  vec3 swirled = at;
  if (banded > 0.5) {
    swirled = shape.storms > 0.0 ? stormed(at) : at;
    t = clamp(bandsAt(swirled, pixel), 0.0, 1.0);
  } else {
    vec3 p = at + shape.warp * field(at * 1.1 + offset.yzx) + offset;
    vec4 ground = fbm(p, shape.scale, pixel, shape.erosion, shape.octaves);
    vec3 round = at + offset;
    float big = shape.craters > 0.0 ? cratersAt(round, shape.scale * 4.0, pixel) : 0.0;
    cratered = shape.craters > 0.0 ? big + 0.5 * cratersAt(round, shape.scale * 13.0, pixel) : 0.0;
    t = shareOf(ground.wy);
    broad = ground.z / ground.y;
    fray = (ground.x - ground.z) / ground.y;
    height = ground.x / ground.y + cratered * 0.8;
    relieved = ground.z / ground.y + big * 0.8 * (1.0 - smoothstep(0.012, 0.03, shape.scale * 4.0 * pixel));
    if (continents) {
      vec4 land = fbm(p, 0.6 + 4.4 * (1.0 - shape.gather), pixel, 0.0, 3.0);
      float lean = 0.9 * smoothstep(0.6, 1.0, shape.gather);
      float rough = 0.5 - 0.2 * shape.gather;
      float spread = sqrt(1.0 + lean * lean / 3.0 + rough * rough);
      float coarse = land.w / land.y + lean * dot(at, normalize(offset - 8.0));
      float above = coarse - log(shape.sea / (1.0 - shape.sea)) / 1.702 * spread;
      float near = 1.0 - smoothstep(0.0, above > 0.0 ? 0.5 : 1.1, abs(above));
      inland = smoothstep(0.8, 1.4, above);
      t = shareOf(vec2(coarse + (rough + 0.5 * near) * ground.w / ground.y + 2.5 * near * fray, spread));
    }
  }
  float minor = 0.0;
  if (minorShare > 0.002 && !continents) {
    vec4 patches = fbm(at + minorOffset, shape.mix, pixel, 0.0, 3.0);
    float pole = (abs(axis.y) - 0.5) * 3.46 * sign(minorOffset.x - 8.0);
    float z = (patches.x / patches.y + 0.7 * broad + 0.4 * pole) * 0.77 + 1.2 * fray;
    float edge = 0.03;
    if (banded > 0.5) {
      z = noise(vec3(swirled.y * max(shape.bands * 0.3, 3.0), minorOffset.xy)) / SPREAD;
      edge = min(0.1, 0.5 * minorShare);
    }
    minor = smoothstep(1.0 - minorShare - edge, 1.0 - minorShare + edge, shareOf(vec2(z, 1.0)));
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
  float landed = 1.0;
  float shore = t;
  if (shape.sea > 0.0) {
    float coast = max(fwidth(t), 0.002);
    wet = 1.0 - smoothstep(shape.sea - coast, shape.sea + coast, t);
    landed = smoothstep(shape.sea, shape.sea + 0.04, t) * inland;
    t = clamp((t - shape.sea) / max(1.0 - shape.sea, 0.001), 0.0, 1.0);
  }
  float tint = mix(0.7, t, 0.8);
  float bare = tint;
  if (continents) {
    float lat = abs(axis.y) + 0.2 * flow.x + 0.1 * broad;
    float cold = lat + 0.15 * t + 1.8 * shape.caps;
    float dry = 1.0 - smoothstep(0.06, 0.22, abs(lat - 0.42)) + 2.5 * minorShare - 0.6 + 0.45 * flow.z + 0.35 * t;
    minor = max(smoothstep(0.5, 0.8, dry), smoothstep(1.1, 1.2, cold));
    tint = clamp(0.15 + 0.9 * dry, 0.0, 1.0);
    bare = 1.0 - smoothstep(0.6, 1.0, cold);
  }
  vec3 major = rampOf(low, mid, high, tint);
  vec3 second = rampOf(minorLow, minorMid, minorHigh, bare);
  float matched = max(step(0.001, glowLevel), banded > 0.5 ? 0.6 : 1.0 - smoothstep(0.028, 0.036, dot(mid, LUMA)));
  second *= mix(1.0, dot(major, LUMA) / max(dot(second, LUMA), 1e-4), matched);
  vec3 albedo = mix(major, second, minor);
  if (style > 1.5) albedo = rampOf(sulfurLow, sulfurMid, sulfurHigh, tint);
  if (banded > 0.5) albedo = mix(albedo, mid, shape.clouds * 0.3) * (1.0 + (0.09 + 0.12 * shape.turbulence) * streaksAt(swirled, pixel));
  albedo *= mix(vec3(1.0), detail, min(shape.detail * 2.0, 1.0)) * (1.0 + 0.25 * clamp(cratered, -1.0, 1.0));
  if (style > 1.5) albedo = mix(albedo, sulfurLow * 1.2, smoothstep(0.9, 0.97, molten));
  if (shape.sea > 0.0) {
    float depth = continents ? smoothstep(0.0, 0.05, (shape.sea - shore) / shape.sea) : smoothstep(0.0, 0.6, (shape.sea - shareOf(vec2(height, 1.0))) / shape.sea);
    albedo = mix(albedo, mix(seaShallow, seaDeep, depth), wet);
  }
  if (shape.caps > 0.0) {
    float pole = abs(axis.y) + 0.3 * (t - 0.5) + 0.15 * flow.y;
    albedo = mix(albedo, mix(vec3(0.86, 0.9, 0.95), high, 0.35) * detail, smoothstep(1.0 - shape.caps, 1.0 - shape.caps + 0.06, pole));
  }
  if (grooved > 0.5) {
    float lane;
    float other;
    float grooves = groovesAt(at, 0.9 + 0.3 * shape.scale, pixel, lane) + groovesAt(turned(at, 1.9) + 4.0, 1.4 + 0.3 * shape.scale, pixel, other);
    albedo *= mix(0.72, 1.08, max(lane, other)) * (1.0 - 0.35 * min(grooves, 1.0));
  }
  if (shape.halves > 0.0) albedo *= 1.0 - shape.halves * smoothstep(-0.12, 0.12, axis.x + 0.18 * field(at * 2.0 + minorOffset).x);
  float rift = 0.0;
  float burning = 0.0;
  if (shape.rifts > 0.0) {
    float riven = smoothstep(0.25, 0.5, shape.rifts) * (1.0 - grooved);
    if (glowLevel > 0.0) riven *= smoothstep(0.08, 0.2, shape.craters);
    float ridge = 0.0;
    if (riven > 0.0 && glowLevel > 0.0) {
      vec2 crack = crackAt(at + offset, 3.0 + shape.scale, vec2(0.02, 0.14 + 0.16 * shape.rifts), pixel);
      rift = crack.x * riven;
      burning = rift * rift * smoothstep(1.5, 6.0, crack.y);
    } else if (riven > 0.0) rift = lines(ridge, at, 0.008 + 0.02 * shape.rifts, pixel) * riven;
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
  vec3 bent = bentBy(relieved * landed * relief * world * (1.0 - 0.3 * grooved), normal);
  float near = 1.0 - smoothstep(0.004, 0.008, pixel);
  if (banded < 0.5 && near > 0.0) bent = grained(bent, normalize(axis + warpAmount * flow), dot(own, LUMA), clamp(pixel, 0.0032, 0.012), relief * min(shape.detail * 2.0, 1.0) * landed * near, angle);
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
    float heat = mix(vents, burning * (0.75 + 0.25 * smoothstep(0.1, 0.8, flow.z + 0.4)), smoothstep(0.08, 0.2, shape.craters));
    float burn = 0.4 + 1.3 * abs(field(direction * 2.4 + offset).y);
    vec3 glow = mix(glowColour * glowColour, vec3(1.0, 0.78, 0.42), heat * heat * 0.7) * heat * burn * 2.0;
    if (style > 0.5 && style < 1.5) glow = veinsOf(at + offset, pixel, burn);
    colour += glow;
  }
  if (air > 0.5) colour = nightAir(colour, albedo, light);
  gl_FragColor = vec4(colour, 1.0);
  ${FARAWAY}
  #include <tonemapping_fragment>
  #include <colorspace_fragment>
}
`;

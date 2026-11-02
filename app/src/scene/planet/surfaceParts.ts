// What a world's surface shader declares and the helpers it calls, apart from its main(): uniforms, then the parts the frames' look is made of.
export const UNIFORMS = /* glsl */ `
uniform mat4 modelMatrix;
uniform sampler2D surface;
uniform sampler2D second;
uniform sampler2D cloudMap;
uniform sampler2D ringMap;
uniform sampler2D nightMap;
uniform mat3 spin;
uniform vec3 sun;
uniform vec3 warpOffset;
uniform vec3 rampLow;
uniform vec3 rampMid;
uniform vec3 rampHigh;
uniform vec3 seaShallow;
uniform vec3 seaDeep;
uniform vec3 glowColour;
uniform vec3 hazeColour;
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
uniform float blueSea;
uniform float hazeAmount;
uniform float seaLevel;
uniform float glowLevel;
uniform float ringInner;
uniform float ringOuter;
uniform float ringOpacity;
uniform float nightLights;
varying vec3 vLocal;
varying vec3 vNormal;
varying vec3 vWorld;
varying vec3 vSun;
`;

export const PARTS = /* glsl */ `
const float TEXEL = 0.0032;
const float REACH = 0.012;
const vec3 LUMA = vec3(0.2126, 0.7152, 0.0722);
// The frames' sea, in the working space; how far the light is softened, and the edge an airless world keeps in the sun.
const vec3 SEA_FLOOR = vec3(0.017, 0.032, 0.095);
const float SOFT_AIR = 1.0;
const float SOFT_BARE = 0.55;
const float EDGE = 0.4;
// What a world keeps in its night, so its dark side is a shape against the sky and not a hole in it.
const float NIGHT = 0.007;
const float NIGHT_GLOW = 0.07;
const vec3 DEEP_BLUE = vec3(0.12, 0.22, 0.5);

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

// A slope read from the map beside each point, a pixel away and no nearer than a texel, so the detail a pixel can carry is shaded and no
// finer: the same slope at any size, soft-clipped so a crater's rim never becomes a line.
vec3 bumped(vec3 axis, vec3 flow, float height, float angle) {
  vec3 normal = normalize(vNormal);
  if (relief < 0.004) return normal;
  vec3 east = normalize(cross(vec3(0.0, 1.0, 0.0), axis));
  vec3 north = cross(axis, east);
  float reach = clamp(length(fwidth(axis)), TEXEL, REACH);
  float toEast = toneOf(read(surface, lookupOf(spin * normalize(axis + east * reach + warpAmount * flow))).rgb);
  float toNorth = toneOf(read(surface, lookupOf(spin * normalize(axis + north * reach + warpAmount * flow))).rgb);
  vec3 slope = (east * (toEast - height) + north * (toNorth - height)) / reach;
  slope /= 1.0 + 0.35 * length(slope);
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

// A line is never thinner than a pixel, or it crawls as the world turns.
float lines(vec3 at, float width) {
  float away = min(seams(at), seams(at * 2.3 + 11.0) * 2.0);
  return 1.0 - smoothstep(0.0, max(width, 1.1 * fwidth(away)), away);
}

// One side always faces its star: scorched glass at the centre, desert, a thin belt of life, then ice to the far side.
vec3 eyeball(vec3 albedo, float tone, float day) {
  vec3 ice = mix(vec3(0.46, 0.58, 0.74), vec3(0.93, 0.96, 0.99), tone);
  vec3 cold = mix(ice, albedo * vec3(0.62, 0.78, 0.6), smoothstep(0.0, 0.4, day));
  vec3 warm = mix(cold, albedo, smoothstep(0.2, 0.7, day));
  return mix(warm, albedo * vec3(0.3, 0.2, 0.16), smoothstep(0.78, 0.97, day));
}
`;

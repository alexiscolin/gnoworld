// What both surface programs declare and call, apart from their main(): the Earth's (real maps as they are) and every other world's
// (generated, generatedShader.ts). The light is one, word for word on both: Alexis approved it on the Earth (21b00fc8).

/** The uniforms and varyings both surface programs read. */
export const COMMON = /* glsl */ `
uniform mat4 modelMatrix;
uniform sampler2D surface;
uniform sampler2D cloudMap;
uniform sampler2D ringMap;
uniform sampler2D nightMap;
uniform mat3 spin;
uniform vec3 sun;
uniform vec3 hazeColour;
uniform float time;
uniform float cloudTime;
uniform float relief;
uniform float air;
uniform float hazeAmount;
uniform float ringInner;
uniform float ringOuter;
uniform float ringOpacity;
varying vec3 vLocal;
varying vec3 vNormal;
varying vec3 vWorld;
varying vec3 vSun;
`;

// The frames' sea, in the working space; how far the light is softened, and the edge an airless world keeps in the sun. What a world
// keeps in its night, so its dark side is a shape against the sky and not a hole in it. The warm family every city light keeps.
export const PARTS = /* glsl */ `
const vec3 LUMA = vec3(0.2126, 0.7152, 0.0722);
const vec3 SEA_FLOOR = vec3(0.017, 0.032, 0.095);
const float SOFT_AIR = 1.0;
const float SOFT_BARE = 0.55;
const float EDGE = 0.4;
const float NIGHT = 0.007;
const float NIGHT_GLOW = 0.07;
const vec3 DEEP_BLUE = vec3(0.12, 0.22, 0.5);
const vec3 CITY_LIGHT = vec3(1.0, 0.8, 0.52);

vec3 turned(vec3 v, float angle) {
  float c = cos(angle);
  float s = sin(angle);
  return vec3(c * v.x + s * v.z, v.y, c * v.z - s * v.x);
}

float toneOf(vec3 colour) {
  return sqrt(dot(colour, LUMA));
}

float ringShade() {
  if (ringOuter <= 0.0 || abs(vSun.y) < 0.001) return 1.0;
  float along = -vLocal.y / vSun.y;
  if (along <= 0.0) return 1.0;
  float reach = (length((vLocal + along * vSun).xz) - ringInner) / (ringOuter - ringInner);
  if (reach <= 0.0 || reach >= 1.0) return 1.0;
  return 1.0 - 0.85 * ringOpacity * textureLod(ringMap, vec2(reach, 0.5), 0.0).r;
}
`;

// The light Alexis approved: the day fading into the night over a wide arc, softened towards the terminator, more with air; no colour of
// the star's own; the sea's glint; clouds and their shadows; air lifting the day side's edge into its colour, or a thin edge of sunlight
// where there is none; and a night with air keeping a deep blue and the ground's faint form.
export const SHADE = /* glsl */ `
vec3 litBy(vec3 albedo, float wet, vec3 bent, vec3 normal, vec3 view, out float light, out float shine) {
  light = smoothstep(-0.16, 0.95, dot(bent, sun));
  float facing = max(dot(normal, view), 0.001);
  float dusty = 2.0 * light / (light + facing + 0.001) * smoothstep(0.0, 0.06, light);
  float soft = pow(light, 0.9) * pow(facing, 0.28);
  shine = mix(dusty, soft, mix(SOFT_BARE, SOFT_AIR, air)) * ringShade();
  vec3 colour = albedo * shine + albedo * NIGHT;
  float gleam = max(dot(normal, normalize(sun + view)), 0.0);
  float glitter = pow(gleam, 60.0) * 0.05;
  colour += wet * glitter * smoothstep(0.0, 0.1, light) * vec3(1.0, 0.94, 0.84);
  return colour;
}

vec3 cloudsOver(vec3 colour, float cover, float shadowed, float shine, vec3 tint) {
  colour *= 1.0 - 0.36 * shadowed;
  return mix(colour, tint * shine + 0.0015, cover * 0.9);
}

vec3 rimmed(vec3 colour, vec3 normal, vec3 view, float day) {
  float facing = max(dot(normal, view), 0.001);
  float rim = pow(1.0 - facing, 2.4) * smoothstep(-0.05, 0.4, day);
  if (air > 0.5) colour = mix(colour, hazeColour, rim * hazeAmount);
  else colour += EDGE * pow(1.0 - facing, 5.0) * smoothstep(0.02, 0.5, day);
  return colour;
}

vec3 nightAir(vec3 colour, vec3 albedo, float light) {
  return colour + mix(hazeColour * 0.35, DEEP_BLUE, 0.65) * (0.35 + dot(albedo, LUMA)) * NIGHT_GLOW * (1.0 - light);
}
`;

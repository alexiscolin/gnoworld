// What the planet's shaders share. The lattice is integer arithmetic, so a world's warp is the same on every GPU, where a sine's hash is not.

/** A smooth random vector of position, each component about -1 to 1. */
export const FIELD = /* glsl */ `
vec3 latticeAt(ivec3 cell) {
  uvec3 v = uvec3(cell + 4096) * 1664525u + 1013904223u;
  v.x += v.y * v.z; v.y += v.z * v.x; v.z += v.x * v.y;
  v ^= v >> 16u;
  v.x += v.y * v.z; v.y += v.z * v.x; v.z += v.x * v.y;
  return vec3(v) / 2147483648.0 - 1.0;
}
vec3 field(vec3 p) {
  vec3 floored = floor(p);
  vec3 f = p - floored;
  vec3 u = f * f * (3.0 - 2.0 * f);
  ivec3 c = ivec3(floored);
  return mix(
    mix(mix(latticeAt(c), latticeAt(c + ivec3(1, 0, 0)), u.x),
        mix(latticeAt(c + ivec3(0, 1, 0)), latticeAt(c + ivec3(1, 1, 0)), u.x), u.y),
    mix(mix(latticeAt(c + ivec3(0, 0, 1)), latticeAt(c + ivec3(1, 0, 1)), u.x),
        mix(latticeAt(c + ivec3(0, 1, 1)), latticeAt(c + ivec3(1, 1, 1)), u.x), u.y),
    u.z);
}
`;

/** How near a point lies to the seam between two cells of a cracked plate: straight fractures, where a field's zeros curl into loops. */
export const SEAMS = /* glsl */ `
float seams(vec3 p) {
  ivec3 home = ivec3(floor(p));
  float first = 9.0;
  float second = 9.0;
  for (int z = -1; z <= 1; z++)
    for (int y = -1; y <= 1; y++)
      for (int x = -1; x <= 1; x++) {
        ivec3 cell = home + ivec3(x, y, z);
        vec3 at = vec3(cell) + 0.5 + 0.42 * latticeAt(cell);
        float d = dot(at - p, at - p);
        if (d < first) { second = first; first = d; }
        else if (d < second) second = d;
      }
  return sqrt(second) - sqrt(first);
}
`;

/** Where a direction falls on an equirectangular map, with the derivatives that keep the seam out of the mipmaps. */
export const LOOKUP = /* glsl */ `
const float PI = 3.14159265359;
const float TAU = 6.28318530718;
struct Lookup { vec2 uv; vec2 dx; vec2 dy; };
Lookup lookupOf(vec3 direction) {
  float east = atan(direction.z, direction.x) / TAU + 0.5;
  float across = fract(east + 0.5) - 0.5;
  float u = fwidth(east) <= fwidth(across) ? east : across;
  vec2 uv = vec2(u, acos(clamp(direction.y, -1.0, 1.0)) / PI);
  return Lookup(uv, dFdx(uv), dFdy(uv));
}
vec4 read(sampler2D map, Lookup at) {
  return textureGrad(map, at.uv, at.dx, at.dy);
}
`;

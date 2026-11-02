// What the generated worlds' program calls, apart from its main(): its noise, the forms a ground and a gas world take, and a real map's
// detail. Comments live here, out of the strings that ship.

// The noise: integer hashes, so a world is the same on every GPU (as chunks.ts's lattice). One octave's spread and mean absolute value
// were measured on a port of it, 40,000 points of the sphere (0.192 and 0.156): a height's share among its world's then reads as a
// logistic of its height over its spread, whatever the octaves. An octave fades out between four and two pixels a wave.
export const NOISE = /* glsl */ `
const float SPREAD = 0.192;
const float HOLLOW = 0.156;
uint hashOf(ivec3 c) {
  uvec3 v = uvec3(c + 32768);
  uint h = v.x * 0x8da6b343u ^ v.y * 0xd8163841u ^ v.z * 0xcb1ab31fu;
  h ^= h >> 16u; h *= 0x7feb352du; h ^= h >> 15u; h *= 0x846ca68bu; h ^= h >> 16u;
  return h;
}
vec3 slopeAt(ivec3 c) {
  uint h = hashOf(c);
  return vec3(float(h & 1023u), float((h >> 10u) & 1023u), float((h >> 20u) & 1023u)) / 511.5 - 1.0;
}
float corner(ivec3 c, vec3 f, ivec3 d) {
  return dot(slopeAt(c + d), f - vec3(d));
}
float noise(vec3 p) {
  vec3 i = floor(p);
  vec3 f = p - i;
  vec3 u = f * f * f * (f * (f * 6.0 - 15.0) + 10.0);
  ivec3 c = ivec3(i);
  return mix(
    mix(mix(corner(c, f, ivec3(0, 0, 0)), corner(c, f, ivec3(1, 0, 0)), u.x),
        mix(corner(c, f, ivec3(0, 1, 0)), corner(c, f, ivec3(1, 1, 0)), u.x), u.y),
    mix(mix(corner(c, f, ivec3(0, 0, 1)), corner(c, f, ivec3(1, 0, 1)), u.x),
        mix(corner(c, f, ivec3(0, 1, 1)), corner(c, f, ivec3(1, 1, 1)), u.x), u.y),
    u.z);
}
vec3 fbm(vec3 p, float frequency, float pixel, float carved, float octaves) {
  float sum = 0.0;
  float coarse = 0.0;
  float weight = 0.0;
  float squares = 0.0;
  float amplitude = 1.0;
  for (int i = 0; i < 12; i++) {
    if (float(i) >= octaves || frequency * pixel > 0.5) break;
    float n = noise(p * frequency + float(i) * 1.7);
    n += carved * (2.0 * (abs(n) - HOLLOW) - n);
    sum += amplitude * n * (1.0 - smoothstep(0.25, 0.5, frequency * pixel));
    coarse += amplitude * n * (1.0 - smoothstep(0.06, 0.125, frequency * pixel));
    weight += amplitude;
    squares += amplitude * amplitude;
    amplitude *= shape.roughness;
    frequency *= shape.lacunarity;
  }
  return vec3(sum, SPREAD * sqrt(max(squares, 1.0)), coarse) / max(weight, 1.0);
}
float shareOf(vec2 height) {
  return 1.0 / (1.0 + exp(-1.702 * height.x / height.y));
}
`;

// A ground: its height from the warped fBm, its craters, bowls with a raised rim where a cell holds one; a gas world: its bands, each
// latitude moved by a churn four times finer across the bands than along them, around storms that turn the flow.
export const FORMS = /* glsl */ `
float cratersAt(vec3 p, float frequency, float pixel) {
  if (frequency * pixel > 0.2) return 0.0;
  vec3 q = p * frequency;
  ivec3 base = ivec3(floor(q - 0.5));
  float depth = 0.0;
  for (int z = 0; z <= 1; z++)
    for (int y = 0; y <= 1; y++)
      for (int x = 0; x <= 1; x++) {
        ivec3 cell = base + ivec3(x, y, z);
        uint h = hashOf(cell + 101);
        if (float(h & 255u) / 255.0 >= shape.craters) continue;
        vec3 centre = vec3(cell) + 0.35 + 0.3 * vec3(float((h >> 16u) & 255u), float((h >> 24u) & 255u), float((h >> 4u) & 15u) * 17.0) / 255.0;
        float radius = 0.18 + 0.17 * float((h >> 8u) & 255u) / 255.0;
        float d = length(q - centre) / radius;
        depth += d < 1.0 ? d * d - 1.0 : 0.0;
        depth += 0.4 * exp(-(d - 1.0) * (d - 1.0) / 0.05);
      }
  return depth * (1.0 - smoothstep(0.1, 0.2, frequency * pixel));
}
vec3 stormed(vec3 q) {
  vec3 cells = q * 2.5 + offset;
  ivec3 base = ivec3(floor(cells - 0.5));
  for (int z = 0; z <= 1; z++)
    for (int y = 0; y <= 1; y++)
      for (int x = 0; x <= 1; x++) {
        ivec3 cell = base + ivec3(x, y, z);
        uint h = hashOf(cell + 211);
        if (float(h & 255u) / 255.0 >= shape.storms * 0.4) continue;
        vec3 centre = normalize((vec3(cell) + 0.5 + 0.25 * slopeAt(cell + 13) - offset) / 2.5);
        float radius = 0.05 + 0.13 * float((h >> 8u) & 255u) / 255.0;
        float d = length(q - centre) / radius;
        if (d >= 1.0) continue;
        float turn = (1.0 - d) * (1.0 - d) * 5.0 * (float((h >> 16u) & 1u) * 2.0 - 1.0);
        q = q * cos(turn) + cross(centre, q) * sin(turn) + centre * dot(centre, q) * (1.0 - cos(turn));
      }
  return q;
}
float streaksAt(vec3 q, float pixel) {
  float sum = 0.0;
  float weight = 0.0;
  float amplitude = 1.0;
  float frequency = shape.scale * 12.0;
  for (int i = 0; i < 6; i++) {
    if (frequency * pixel > 0.5) break;
    sum += amplitude * noise(vec3(q.x, q.y * 5.0, q.z) * frequency + float(i) * 3.1) * (1.0 - smoothstep(0.3, 0.5, frequency * pixel));
    weight += amplitude;
    amplitude *= 0.85;
    frequency *= 2.0;
  }
  return sum / max(weight, 1.0) / SPREAD;
}
float bandsAt(vec3 q, float pixel) {
  vec3 churn = fbm(vec3(q.x, q.y * 4.0, q.z) + offset, shape.scale, pixel, 0.0, shape.octaves);
  float latitude = q.y + shape.turbulence * 0.06 * churn.x / churn.y;
  float band = noise(vec3(latitude * shape.bands * 0.5, offset.x, offset.y));
  band += 0.35 * noise(vec3(latitude * shape.bands * 1.37, offset.z, offset.x));
  return 0.5 + band * 1.4 + 0.12 * shape.turbulence * churn.x / churn.y;
}
`;

// A real map's fine contrast: its colour over its own blurred self at a level past the pixel's, its colour kept by 1 - recolour. The
// ground's slope on screen, as three's bump map takes a height's (perturbNormalArb). A rift never thinner than a pixel, `pixel` being
// a pixel in the rifts' own units, or it crawls as the world turns: no derivative, so a pixel no rift reaches skips them. A locked world: scorched glass facing its star, desert, a thin belt of life, then ice to the far side.
export const DETAIL = /* glsl */ `
const float DETAIL_BLUR = 3.0;
vec3 detailOf(sampler2D map, Lookup at) {
  vec3 fine = read(map, at).rgb;
  float level = log2(max(length(at.dx), length(at.dy)) * float(textureSize(map, 0).x) + 1.0);
  vec3 smoothed = textureLod(map, at.uv, max(level, 0.0) + DETAIL_BLUR).rgb;
  vec3 ratio = clamp(fine / max(smoothed, vec3(0.01)), 0.25, 3.0);
  float light = dot(fine, LUMA) / max(dot(smoothed, LUMA), 0.01);
  return mix(ratio, vec3(clamp(light, 0.25, 3.0)), recolour);
}
vec3 bentBy(float height, vec3 normal) {
  vec3 dx = dFdx(vWorld);
  vec3 dy = dFdy(vWorld);
  vec3 across = cross(dy, normal);
  vec3 along = cross(normal, dx);
  float det = dot(dx, across);
  vec3 slope = sign(det) * (dFdx(height) * across + dFdy(height) * along) / max(abs(det), 1e-12);
  slope /= 1.0 + 3.0 * length(slope);
  return normalize(normal - slope);
}
float lines(vec3 at, float width, float pixel) {
  float away = min(seams(at), seams(at * 2.3 + 11.0) * 2.0);
  return 1.0 - smoothstep(0.0, max(width, pixel), away);
}
vec3 eyeball(vec3 albedo, float tone, float day) {
  vec3 frost = mix(vec3(0.46, 0.58, 0.74), vec3(0.93, 0.96, 0.99), tone);
  vec3 cold = mix(frost, albedo * vec3(0.62, 0.78, 0.6), smoothstep(0.0, 0.4, day));
  vec3 warm = mix(cold, albedo, smoothstep(0.2, 0.7, day));
  return mix(warm, albedo * vec3(0.3, 0.2, 0.16), smoothstep(0.78, 0.97, day));
}
vec3 rampOf(vec3 one, vec3 two, vec3 three, float t) {
  return t < 0.5 ? mix(one, two, t * 2.0) : mix(two, three, t * 2.0 - 1.0);
}
`;

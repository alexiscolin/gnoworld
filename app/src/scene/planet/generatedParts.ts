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
float fadeAt(float frequency, float pixel) {
  return 1.0 - smoothstep(0.25, 0.5, frequency * pixel);
}
vec4 fbm(vec3 p, float frequency, float pixel, float carved, float octaves) {
  float sum = 0.0;
  float plain = 0.0;
  float coarse = 0.0;
  float weight = 0.0;
  float squares = 0.0;
  float amplitude = 1.0;
  for (int i = 0; i < 12; i++) {
    if (float(i) >= octaves || frequency * pixel > 0.5) break;
    float n = noise(p * frequency + float(i) * 1.7);
    float faded = amplitude * fadeAt(frequency, pixel);
    plain += faded * n;
    n += carved * step(1.5, float(i)) * (2.0 * (sqrt(n * n + 0.0004) - HOLLOW) - n);
    sum += faded * n;
    coarse += amplitude * n * (1.0 - smoothstep(0.06, 0.125, frequency * pixel));
    weight += faded;
    squares += faded * faded;
    amplitude *= shape.roughness;
    frequency *= shape.lacunarity;
  }
  return vec4(sum, SPREAD * sqrt(max(squares, 1e-6)), coarse, plain) / max(weight, 1e-3);
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
        if (ivec3(floor(centre * 2.5 + offset)) != cell) continue;
        float radius = 0.05 + 0.13 * float((h >> 8u) & 255u) / 255.0;
        vec3 apart = q - centre;
        float d = length(vec3(apart.x, apart.y * 1.8, apart.z)) / radius;
        if (d >= 1.0) continue;
        float turn = (1.0 - d) * (1.0 - d) * 1.5 * (float((h >> 16u) & 1u) * 2.0 - 1.0);
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
    float faded = amplitude * (1.0 - smoothstep(0.3, 0.5, frequency * pixel));
    sum += faded * noise(vec3(q.x, q.y * 5.0, q.z) * frequency + float(i) * 3.1);
    weight += faded;
    amplitude *= 0.85;
    frequency *= 2.0;
  }
  return sum / max(weight, 1e-3) / SPREAD;
}
float veinsAt(vec3 p, float pixel) {
  float frequency = 7.0 + 2.0 * shape.scale;
  vec3 q = p * frequency + offset;
  float finer = 1.5 * abs(noise(q * 2.2 + 5.0)) + 1.0 - fadeAt(frequency * 2.2, pixel);
  float away = min(abs(noise(q)), finer);
  float width = 0.022 * (0.5 + smoothstep(-0.25, 0.25, noise(q * 0.3 + 9.0)));
  return 1.0 - smoothstep(0.0, max(width, 1.1 * frequency * pixel), away);
}
vec3 goldOf(float vein, float burn) {
  return mix(vec3(0.6, 0.16, 0.02), vec3(0.9, 0.42, 0.07), vein) * vein * (0.4 + 0.1 * burn) + vec3(0.03, 0.008, 0.0);
}
float bandsAt(vec3 q, float pixel) {
  vec4 churn = fbm(vec3(q.x, q.y * 4.0, q.z) + offset, shape.scale, pixel, 0.0, shape.octaves);
  float latitude = q.y + shape.turbulence * 0.06 * churn.x / churn.y;
  float band = noise(vec3(latitude * shape.bands * 0.5, offset.x, offset.y));
  band += 0.35 * noise(vec3(latitude * shape.bands * 1.37, offset.z, offset.x)) * fadeAt(shape.bands * 1.37, pixel);
  return 0.5 + band * 1.4 + 0.12 * shape.turbulence * churn.x / churn.y;
}
`;

// A real map's fine contrast: its colour over its own blurred self past the pixel's level, its colour kept by 1 - recolour; the Earth's
// cloud map lends its grain alone, over a sky of each world's own. The ground's slope on screen (three's perturbNormalArb). Rifts: a
// warped noise's zero lines, never thinner than a pixel. A locked world: scorched glass facing its star, desert, a belt of life, ice.
export const DETAIL = /* glsl */ `
const float DETAIL_BLUR = 2.0;
vec3 detailOf(sampler2D map, Lookup at) {
  vec3 fine = read(map, at).rgb;
  float level = log2(max(length(at.dx), length(at.dy)) * float(textureSize(map, 0).x) + 1.0);
  vec3 smoothed = textureLod(map, at.uv, max(level, 0.0) + DETAIL_BLUR).rgb;
  vec3 ratio = clamp(fine / max(smoothed, vec3(0.01)), 0.25, 3.0);
  float light = dot(fine, LUMA) / max(dot(smoothed, LUMA), 0.01);
  return mix(ratio, vec3(clamp(light, 0.25, 3.0)), recolour);
}
vec3 grained(vec3 normal, vec3 at, float here, float reach, float amount, float angle) {
  vec3 east = normalize(cross(vec3(0.0, 1.0, 0.0), at));
  vec3 north = cross(at, east);
  float toEast = dot(detailOf(surface, lookupOf(spin * normalize(at + east * reach))), LUMA);
  float toNorth = dot(detailOf(surface, lookupOf(spin * normalize(at + north * reach))), LUMA);
  vec3 slope = (east * (toEast - here) + north * (toNorth - here)) / reach;
  slope /= 1.0 + 0.35 * length(slope);
  return normalize(normal - amount * mat3(modelMatrix) * turned(slope, -angle) / length(modelMatrix[0].xyz));
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
float lines(out float ridge, vec3 at, float width, float pixel) {
  float away = 1.0;
  for (int k = 0; k < 8; k++) {
    if (float(k) >= 2.0 + 6.0 * shape.rifts) break;
    ivec3 cell = ivec3(k, 977, 31) + ivec3(offset);
    vec3 pole = normalize(slopeAt(cell) + vec3(0.001));
    float bend = (float(hashOf(cell + 7) & 255u) / 255.0 - 0.5) * 1.2;
    float run = smoothstep(-0.3, -0.1, noise(at * 0.8 + vec3(float(k) * 3.7)));
    away = min(away, mix(1.0, abs(noise(at * 1.3 + vec3(float(k))) * 0.06 + dot(at, pole) - bend), run));
  }
  width *= 0.6 + 0.8 * smoothstep(-0.25, 0.25, noise(at * 2.0 + 7.0));
  float core = 1.0 - smoothstep(0.0, max(width, pixel), away);
  float edge = max(width, pixel);
  float margins = smoothstep(0.6 * edge, 1.2 * edge, away) * (1.0 - smoothstep(1.2 * edge, 2.4 * edge, away));
  ridge = (margins - 0.6 * core) * smoothstep(3.0, 6.0, width / pixel);
  return core;
}
float skyAt(vec3 sky, float pixel) {
  return 0.736 * pow(shareOf(fbm(sky * 1.5 + minorOffset.yzx, 1.5, pixel, 0.0, 6.0).xy), 2.19);
}
float cloudGrain(Lookup at) {
  float level = log2(max(length(at.dx), length(at.dy)) * float(textureSize(cloudMap, 0).x) + 1.0);
  float smoothed = textureLod(cloudMap, at.uv, max(level, 0.0) + DETAIL_BLUR).r;
  return clamp(read(cloudMap, at).r / max(smoothed, 0.05), 0.5, 1.6);
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

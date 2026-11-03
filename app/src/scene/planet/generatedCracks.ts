// What the generated worlds' program draws along the seams of cells (chunks.ts): a glowing world's veins, a grooved world's lanes.
// Comments live here, out of the strings that ship.

// A crack along the seams of cells, bent then broken at angles: its core, 1 to 0, and its width in pixels; under a pixel it fades out
// whole. Grooves: a narrow lane along each seam of large cells, a bundle of fine dark grooves along it (the seam's distance in 15 steps
// a cell), gone before they are 4 px apart. Veins: two nets of cracks, gold to orange, over a dark maroon ember, as frame 4's Music.
export const CRACKS = /* glsl */ `
vec2 crackAt(vec3 p, float frequency, vec2 width, float pixel) {
  vec3 q = p * frequency + 0.4 * field(p * 2.3 + offset) + 0.16 * field(p * 19.0 + offset.zxy);
  float away = seams(q);
  float wide = mix(width.x, width.y, smoothstep(-0.3, 0.5, noise(q * 0.45 + 7.0)));
  float seen = 2.0 * frequency * pixel;
  return vec2((1.0 - smoothstep(0.0, max(wide, seen), away)) * smoothstep(0.5, 1.5, wide / seen), wide / seen);
}
float groovesAt(vec3 p, float frequency, float pixel, out float lane) {
  vec3 q = p * frequency + 0.3 * field(p * 1.7 + offset);
  float away = seams(q) + 0.04 * noise(q * 1.9);
  lane = 1.0 - smoothstep(0.18, 0.28, away);
  float wave = away * 15.0 + 0.4 * noise(q * 1.3);
  return smoothstep(0.22, 0.4, abs(fract(wave) - 0.5)) * lane * (1.0 - smoothstep(0.25, 0.35, 30.0 * frequency * pixel));
}
vec3 veinsOf(vec3 p, float pixel, float burn) {
  vec2 main = crackAt(p, 4.0 + shape.scale, vec2(0.14, 0.4), pixel);
  vec2 fine = crackAt(p + 2.7, 10.0 + 2.0 * shape.scale, vec2(0.05, 0.22), pixel);
  float heat = max(main.x, 0.6 * fine.x);
  vec3 halo = vec3(0.3, 0.06, 0.004) * pow(main.x, 0.3);
  return rampOf(vec3(0.1, 0.012, 0.0), vec3(0.75, 0.17, 0.01), vec3(1.0, 0.5, 0.1), heat) * heat * (0.85 + 0.2 * burn) + halo + vec3(0.05, 0.009, 0.004);
}
`;

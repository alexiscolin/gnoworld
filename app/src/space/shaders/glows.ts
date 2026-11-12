// The demo's lights (D401): the suns as additive glows on quads turned to the eye, never under a few pixels, a sun seen near wearing a wide
// warm bloom and a soft limb (D495); the dust and the stars as round points; orbits as faint lines; the page's plate drawn behind the planet.
// Their colours are what the screen shows, added.
import { INTRO_SHARE, LENS_DIM, NOISE } from "./planets.ts";

// The linear value three 0.187's grade (its ACES fit at exposure 1, then sRGB; renderer.ts) takes to `seen`, in closed form: the fit's
// quadratic solved for its positive root between the matrices' inverses. White is held just under, where the fit would run to infinity.
export const UNGRADE = /* glsl */ `
vec3 ungrade(vec3 seen) {
  vec3 c = clamp(seen, 0.0, 0.995);
  vec3 lin = mix(c / 12.92, pow((c + 0.055) / 1.055, vec3(2.4)), step(0.04045, c));
  vec3 z = clamp(mat3(vec3(0.64304, 0.05927, 0.00596), vec3(0.31119, 0.93144, 0.06393), vec3(0.04578, 0.00929, 0.93012)) * lin, 0.0, 0.98);
  vec3 a = 1.0 - 0.983729 * z; vec3 b = 0.0245786 - 0.432951 * z; vec3 k = -(0.000090537 + 0.238081 * z);
  vec3 v = (-b + sqrt(max(b * b - 4.0 * a * k, 0.0))) / (2.0 * a);
  return mat3(vec3(1.76474, -0.14703, -0.03634), vec3(-0.67578, 1.16025, -0.16244), vec3(-0.08896, -0.01322, 1.19877)) * v * 0.6;
}`;

export const SUNS_VERTEX = /* glsl */ `
attribute vec3 aPlace; attribute vec4 aSun; attribute float aLit; attribute float aDelay; uniform float uPxK; uniform float uLens; uniform float uIntro;
varying vec2 vUv; varying vec3 vColour; varying float vCore; varying float vDim; varying float vNear; varying float vIntro; varying float vPhase;
void main() {
  float d = distance(cameraPosition, aPlace);
  vIntro = ${INTRO_SHARE};
  // From far a sun is never under 2 to 3.2 px of radius, the heaviest the largest, and its glow carries it to a bright mark.
  float floorPx = 2.0 + 1.2 * clamp(aSun.w / 4.5, 0.0, 1.0);
  float core = max(aSun.w, floorPx * uPxK * d) * (0.35 + 0.65 * vIntro);
  vNear = smoothstep(2.0, 14.0, aSun.w / (uPxK * d));
  float halo = core * mix(11.0, 20.0, vNear);
  // The quad stands square to the screen (never to the sun's own direction, whose disc the off-axis frustum stretches at the frame's edge,
  // D516), its size kept to the same angle as the distance gives.
  vec3 right = vec3(viewMatrix[0][0], viewMatrix[1][0], viewMatrix[2][0]);
  vec3 up = vec3(viewMatrix[0][1], viewMatrix[1][1], viewMatrix[2][1]);
  float depth = max(-(viewMatrix * vec4(aPlace, 1.0)).z, 1e-3);
  vUv = position.xy; vPhase = dot(aPlace, vec3(0.37, 0.61, 0.83)); vColour = aSun.rgb; vCore = core / halo; vDim = ${LENS_DIM};
  gl_Position = projectionMatrix * viewMatrix * vec4(aPlace + (right * position.x + up * position.y) * halo * min(depth / d, 1.0), 1.0);
}`;

// A star's face, two draws of one quad: the DISC, opaque and written in depth (it hides what stands behind, not what stands nearer), and
// the GLOW round it, added. uLife is 0 under reduced motion (a still face, the same look); uTime stops where the loop draws no frame; a
// disc of a few pixels is flat.
const SUN_HEAD = /* glsl */ `
uniform float uGain; uniform float uThrough; uniform float uTime; uniform float uLife;
varying vec2 vUv; varying vec3 vColour; varying float vCore; varying float vDim; varying float vNear; varying float vIntro; varying float vPhase;
${UNGRADE}
${NOISE}
float discOf() { return vCore * mix(0.9, 0.875, vNear); }
float rimOf(float rr) {
  float aa = fwidth(rr) + (1.0 - vNear) * 0.12 * vCore;
  return 1.0 - smoothstep(discOf() - aa, discOf() + aa, rr);
}
// Smooth value noise: a quintic fade on a lattice turned from one octave to the next, so no axis shows as blocks.
float soft(vec3 x) {
  vec3 i = floor(x); vec3 f = fract(x); f = f * f * f * (f * (f * 6.0 - 15.0) + 10.0);
  return mix(mix(mix(h13(i), h13(i + vec3(1.0, 0.0, 0.0)), f.x), mix(h13(i + vec3(0.0, 1.0, 0.0)), h13(i + vec3(1.0, 1.0, 0.0)), f.x), f.y),
             mix(mix(h13(i + vec3(0.0, 0.0, 1.0)), h13(i + vec3(1.0, 0.0, 1.0)), f.x), mix(h13(i + vec3(0.0, 1.0, 1.0)), h13(i + vec3(1.0, 1.0, 1.0)), f.x), f.y), f.z);
}
const mat3 TURN = mat3(0.80, 0.60, 0.0, -0.48, 0.64, 0.60, 0.36, -0.48, 0.80);
`;

export const SUNS_FRAGMENT = /* glsl */ `
${SUN_HEAD}
void main() {
  float t = uTime * uLife;
  float rr = length(vUv); float c = vCore; float fade = 1.0 - smoothstep(0.5, 1.0, rr);
  float inside = 1.0 - rimOf(rr);
  // Far off the glow is what shows a system; seen near it hugs the disc (a few radii, faint) so the black of space stays black.
  float away = rr / discOf();
  float hug = 0.4 * exp(-max(away - 1.0, 0.0) * 2.6) * (1.0 - smoothstep(2.0, 4.0, away));
  float glow = mix(c * c / (rr * rr + c * c * 0.35) * 0.9 * fade, hug, vNear) * (1.0 + 0.1 * sin(t * 1.0 + vPhase));
  float warmth = (exp(-rr * 5.5) * 0.24 + exp(-rr * 14.0) * 0.3) * fade * vNear * 0.15 * (1.0 + 0.18 * sin(t * 0.7 + vPhase * 1.7));
  vec3 warm = mix(vColour, vec3(1.0, 0.8, 0.56), 0.4);
  // The corona: soft rays out of the rim, along an angle whose noise drifts (the rays shift) and swells and fades (they pulse), slowly.
  vec3 rays = vec3(0.0);
  if (vNear > 0.02 && away > 1.0 && away < 2.4) {
    vec3 ring = vec3(cos(atan(vUv.y, vUv.x)), sin(atan(vUv.y, vUv.x)), 0.0);
    float s = soft(ring * 2.2 + vec3(0.0, 0.0, t * 0.11 + vPhase)) * 0.6 + soft(ring * 5.0 + vec3(t * 0.05, 0.0, t * 0.17 - vPhase)) * 0.4;
    float reach = 0.15 + 0.7 * s * s;
    float ray = exp(-(away - 1.0) / reach) * (1.0 - smoothstep(1.7, 2.4, away)) * (0.35 + 0.65 * s) * (0.85 + 0.15 * sin(t * 0.8 + vPhase + s * 6.0));
    rays = warm * ray * 0.22 * vNear;
  }
  vec3 light = (vColour * glow + warm * warmth + rays) * inside * uGain * vDim * vIntro;
  // Through the flight's blur the whole frame is graded anew: the glow goes in ungraded, so it shows the same in flight and at rest.
  gl_FragColor = vec4(uThrough > 0.5 ? ungrade(light) : light, 1.0);
}`;

export const SUN_DISC_FRAGMENT = /* glsl */ `
${SUN_HEAD}
void main() {
  float t = uTime * uLife;
  float rr = length(vUv);
  float rim = rimOf(rr);
  if (rim < 0.02) discard;
  vec3 face = vec3(1.0, 0.97, 0.92);
  if (vNear > 0.02) {
    float radius = discOf();
    float d = min(rr / radius, 1.0);
    float mu = sqrt(1.0 - d * d);
    vec3 q = vec3(vUv / radius, mu) + vPhase;
    // A slow large flow, then cells that form and fade where they stand: each octave moves through the depth of its own noise.
    float flow = soft(q * 2.0 + vec3(t * 0.02, -t * 0.015, 0.0));
    vec3 p = TURN * q;
    float cells = soft(p * 9.0 + vec3(0.0, 0.0, t * 0.22)) * 0.5;
    p = TURN * p;
    cells += soft(p * 17.0 + vec3(0.0, 0.0, t * 0.35 + 7.0)) * 0.3;
    p = TURN * p;
    cells += soft(p * 31.0 + vec3(0.0, 0.0, t * 0.5 + 13.0)) * 0.2;
    float g = (cells - 0.5) * 0.8 + (flow - 0.5) * 0.3;
    vec3 hot = mix(vColour, vec3(1.0, 0.95, 0.82), 0.55) * 1.45;
    vec3 edge = mix(vColour, vec3(1.0, 0.38, 0.1), 0.65) * 0.5;
    vec3 lit = mix(edge, hot, pow(mu, 0.8)) * (1.0 + g * (0.45 + 0.55 * mu));
    face = mix(face, lit, vNear);
  }
  // Opaque where it is seen, over whatever stands behind: a sun gone dim for a page is darker, never see-through.
  vec3 seen = face * uGain * vDim;
  gl_FragColor = vec4(uThrough > 0.5 ? ungrade(seen) : seen, rim * vIntro);
}`;

export const DUST_VERTEX = /* glsl */ `
attribute vec4 aColour; attribute float aDelay; uniform float uProj; uniform float uIntro; varying vec3 vColour; varying float vBright;
void main() {
  vec4 seen = viewMatrix * vec4(position, 1.0);
  float size = aColour.w * uProj / max(-seen.z, 1e-3);
  gl_PointSize = clamp(size, 1.0, 2.6); vBright = clamp(size, 0.2, 1.0) * ${INTRO_SHARE}; vColour = aColour.rgb;
  gl_Position = projectionMatrix * seen;
}`;

export const STARS_VERTEX = /* glsl */ `
attribute vec4 aColour; varying vec3 vColour; varying float vBright;
void main() {
  gl_PointSize = 1.0 + aColour.w * 1.4; vBright = 1.0; vColour = aColour.rgb;
  gl_Position = projectionMatrix * viewMatrix * vec4(cameraPosition + position * 20000.0, 1.0);
}`;

export const POINT_FRAGMENT = /* glsl */ `
uniform float uGain; varying vec3 vColour; varying float vBright;
void main() {
  float disc = 1.0 - smoothstep(0.3, 0.5, length(gl_PointCoord - 0.5));
  gl_FragColor = vec4(vColour * disc * vBright * uGain, 1.0);
}`;

export const LINE_VERTEX = "void main() { gl_Position = projectionMatrix * viewMatrix * vec4(position, 1.0); }";
/** A line placed by its mesh (the orbit round a planet framed close, D458). */
export const RING_VERTEX = "void main() { gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0); }";
export const LINE_FRAGMENT =
  "uniform vec3 uColour; uniform float uGain; void main() { gl_FragColor = vec4(uColour * uGain, 1.0); }";

// The quad is the plate's box and two pixels round it (beyond one the fill is nothing), the whole frame while the frame's width is unknown.
export const PLATE_VERTEX = /* glsl */ `
uniform vec4 uBox; uniform float uWidth; uniform float uHeight;
void main() {
  if (uWidth <= 0.0) { gl_Position = vec4(position.xy, 0.99999, 1.0); return; }
  vec2 a = position.xy * 0.5 + 0.5;
  vec2 px = vec2(mix(uBox.x - 2.0, uBox.z + 2.0, a.x), mix(uBox.w + 2.0, uBox.y - 2.0, a.y));
  gl_Position = vec4(px.x / uWidth * 2.0 - 1.0, 1.0 - px.y / uHeight * 2.0, 0.99999, 1.0);
}`;
export const PLATE_FRAGMENT = /* glsl */ `
uniform vec4 uBox; uniform float uFade; uniform float uShown; uniform float uHeight; uniform float uRound; uniform vec3 uFill;
void main() {
  vec2 p = vec2(gl_FragCoord.x, uHeight - gl_FragCoord.y);
  vec2 centre = (uBox.xy + uBox.zw) * 0.5; vec2 extent = (uBox.zw - uBox.xy) * 0.5;
  vec2 q = abs(p - centre) - extent + uRound;
  float edge = length(max(q, 0.0)) + min(max(q.x, q.y), 0.0) - uRound;
  float inside = 1.0 - smoothstep(-1.0, 1.0, edge);
  gl_FragColor = vec4(uFill, inside * mix(0.95, 0.0, smoothstep(uFade, uBox.z, p.x)) * uShown);
  #include <tonemapping_fragment>
  #include <colorspace_fragment>
}`;

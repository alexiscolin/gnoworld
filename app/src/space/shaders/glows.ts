// The demo's lights (D401): the suns as additive glows on quads turned to the eye, never under a few pixels, a sun seen near wearing a wide
// warm bloom and a soft limb (D495); the dust and the stars as round points; orbits as faint lines; the page's plate drawn behind the planet.
// Their colours are what the screen shows, added.
import { INTRO_SHARE, LENS_DIM } from "./planets.ts";

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
varying vec2 vUv; varying vec3 vColour; varying float vCore; varying float vDim; varying float vNear; varying float vIntro;
void main() {
  float d = distance(cameraPosition, aPlace);
  vIntro = ${INTRO_SHARE};
  float core = max(aSun.w, 1.3 * uPxK * d) * (0.35 + 0.65 * vIntro);
  vNear = smoothstep(2.0, 14.0, aSun.w / (uPxK * d));
  float halo = core * mix(11.0, 20.0, vNear);
  // The quad stands square to the screen (never to the sun's own direction, whose disc the off-axis frustum stretches at the frame's edge,
  // D516), its size kept to the same angle as the distance gives.
  vec3 right = vec3(viewMatrix[0][0], viewMatrix[1][0], viewMatrix[2][0]);
  vec3 up = vec3(viewMatrix[0][1], viewMatrix[1][1], viewMatrix[2][1]);
  float depth = max(-(viewMatrix * vec4(aPlace, 1.0)).z, 1e-3);
  vUv = position.xy; vColour = aSun.rgb; vCore = core / halo; vDim = ${LENS_DIM};
  gl_Position = projectionMatrix * viewMatrix * vec4(aPlace + (right * position.x + up * position.y) * halo * min(depth / d, 1.0), 1.0);
}`;

export const SUNS_FRAGMENT = /* glsl */ `
uniform float uGain; uniform float uThrough; varying vec2 vUv; varying vec3 vColour; varying float vCore; varying float vDim; varying float vNear; varying float vIntro;
${UNGRADE}
void main() {
  float rr = length(vUv); float c = vCore; float fade = 1.0 - smoothstep(0.5, 1.0, rr);
  float glow = c * c / (rr * rr + c * c * 0.35) * 0.5 * fade;
  float warmth = (exp(-rr * 5.5) * 0.24 + exp(-rr * 14.0) * 0.3) * fade * vNear;
  float disk = 1.0 - smoothstep(c * mix(0.75, 0.5, vNear), c * mix(1.05, 1.25, vNear), rr);
  vec3 warm = mix(vColour, vec3(1.0, 0.8, 0.56), 0.4);
  vec3 light = (vColour * glow + warm * warmth + vec3(1.0, 0.97, 0.92) * disk) * uGain * vDim * vIntro;
  // Through the flight's blur the whole frame is graded anew: the glow goes in ungraded, so it shows the same in flight and at rest.
  gl_FragColor = vec4(uThrough > 0.5 ? ungrade(light) : light, 1.0);
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

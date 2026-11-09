// The galaxy's body's shaders (parts/sky.ts): the glows are discs turned to the eye, each sun's with a bright small core and a long soft
// fall, the heart's a soft cloud; the grains are fine and round. All belong to the galaxy's view and are gone within
// the disc. Each adds a pixel's own noise, under one level, so their few levels of light never band.
import { FACING, GALAXY_VIEW } from "./planets.ts";

// Interleaved gradient noise, -0.5 to 0.5 of one level, shifted by `phase`: a still pattern, the same each frame; grains stacked on a
// pixel each shift it, so their roundings do not add up the same way.
const dither = (phase = "0.0") =>
  `(fract(52.9829189 * fract(dot(gl_FragCoord.xy, vec2(0.06711056, 0.00583715))) + ${phase}) - 0.5) / 255.0`;
const DITHER = dither();
// What is gone is set outside the screen: no fragment drawn for it.
const GONE = "if (shown < 0.002) { gl_Position = vec4(2.0, 2.0, 2.0, 1.0); gl_PointSize = 0.0; return; }";

export const GLOWS_VERTEX = /* glsl */ `
attribute vec4 aPlace; attribute vec4 aGlow; attribute float aSun; uniform float uGain; uniform float uLens; uniform float uPxK;
uniform float uDisc; uniform vec3 uHeart; varying vec2 vUv; varying vec3 vColour; varying float vSun;
${FACING}
void main() {
  float d = distance(cameraPosition, aPlace.xyz);
  // A sun's glow goes as its system spans 70 to 140 px, its planets coming (the heart's spans none); never wider on screen than from 1.7 radii.
  float shown = (1.0 - smoothstep(70.0, 140.0, aPlace.w / (uPxK * d))) * ${GALAXY_VIEW};
  ${GONE}
  float r = aGlow.w * min(1.0, d / (uDisc * 1.7));
  vec3 right; vec3 up; facing(aPlace.xyz, right, up);
  vUv = position.xy; vSun = aSun;
  vColour = aGlow.rgb * shown * uGain * (1.0 - 0.75 * uLens);
  gl_Position = projectionMatrix * viewMatrix * vec4(aPlace.xyz + (right * position.x + up * position.y) * r, 1.0);
}`;

// A sun: white at its heart, its tint past a tenth of the way, a bright small core over a long fall to nothing at the rim. The heart's: soft.
export const GLOWS_FRAGMENT = /* glsl */ `
varying vec2 vUv; varying vec3 vColour; varying float vSun;
void main() {
  float r2 = dot(vUv, vUv);
  float rim = max(1.0 - r2, 0.0);
  float sun = (0.7 * exp2(-80.0 * r2) + 0.3 * exp2(-9.0 * r2) + 0.1 * exp2(-2.5 * r2)) * rim * rim;
  vec3 white = vec3(max(max(vColour.r, vColour.g), vColour.b));
  vec3 lit = vSun > 0.5 ? mix(white, vColour, smoothstep(0.0, 0.015, r2)) * sun : vColour * exp2(-5.0 * r2) * rim;
  gl_FragColor = vec4(max(lit + ${DITHER}, 0.0), 1.0);
}`;

export const GRAINS_VERTEX = /* glsl */ `
attribute vec4 aColour; uniform float uProj; uniform float uGain; uniform float uLens; uniform float uThin; uniform vec3 uHeart;
uniform float uDisc; uniform float uSize; varying vec3 vColour; varying float vPhase;
void main() {
  vec4 seen = viewMatrix * vec4(position, 1.0);
  float depth = max(-seen.z, 1e-3);
  float shown = ${GALAXY_VIEW} * smoothstep(uDisc * 0.03, uDisc * 0.12, depth);
  ${GONE}
  gl_PointSize = clamp(aColour.w * uDisc * uSize * uProj / depth, 0.0015 * uProj, 0.014 * uProj);
  vColour = aColour.rgb * shown * uGain * uThin * (1.0 - 0.6 * uLens);
  vPhase = fract(position.x * 0.137 + position.z * 0.071);
  gl_Position = projectionMatrix * seen;
}`;

// A grain: a bright tiny core over a soft round fall, inside its square, nothing at its edge.
export const GRAINS_FRAGMENT = /* glsl */ `
uniform float uLight; varying vec3 vColour; varying float vPhase;
void main() {
  vec2 c = gl_PointCoord - 0.5;
  float r2 = dot(c, c) * 4.0;
  float soft = (0.45 * exp2(-30.0 * r2) + 0.55 * exp2(-4.0 * r2)) * max(1.0 - r2, 0.0);
  gl_FragColor = vec4(max(vColour * soft * uLight + ${dither("vPhase")}, 0.0), 1.0);
}`;

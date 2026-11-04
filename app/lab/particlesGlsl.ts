// The particles study's shaders (particlesLook.ts): a world's soft particle, blurred nearer than the focus as a lens does, and the chosen
// cluster's line of light, a thin horizontal band through its brightest world, with a glow where they cross.

export const POINT_VERTEX = /* glsl */ `
attribute vec3 aSize;
attribute vec3 aTint;
attribute float aCluster;
uniform float uFocal;
uniform float uFocus;
uniform float uAperture;
uniform float uBlurMost;
uniform float uGlow;
uniform float uLeast;
uniform float uBokeh;
uniform float uLight;
uniform float uRatio;
uniform float uChosen;
uniform float uGoldLift;
uniform float uDim;
uniform float uWarm;
uniform vec3 uGold;
uniform vec3 uPeach;
uniform vec3 uRose;
varying vec3 vLight;
varying float vBlur;
void main() {
  vec4 seen = modelViewMatrix * vec4(position, 1.0);
  float distance = max(-seen.z, aSize.x * uGlow);
  float sharp = aSize.x * uGlow * uFocal / distance;
  float core = max(sharp, uLeast);
  float blur = min(uBlurMost, uAperture * uFocal * max(0.0, 1.0 / distance - 1.0 / uFocus));
  float size = length(vec2(core, blur));
  float chosen = 1.0 - step(0.5, abs(aCluster - uChosen));
  float light = (sharp / core) * (sharp / core) * pow(core / size, uBokeh);
  vec3 tint = mix(aTint, mix(uPeach, uRose, aSize.z), uWarm * step(0.0, aSize.z));
  vLight = mix(tint * uDim, uGold * uGoldLift, chosen) * light * uLight * aSize.y;
  vBlur = blur / size;
  gl_Position = projectionMatrix * seen;
  gl_PointSize = 2.0 * size * uRatio;
}`;

// A sharp particle is a soft round, most of its light at its heart; a blurred one a flat disc with a soft rim, as a lens's.
export const POINT_FRAGMENT = /* glsl */ `
varying vec3 vLight;
varying float vBlur;
void main() {
  vec2 at = gl_PointCoord * 2.0 - 1.0;
  float reach = dot(at, at);
  if (reach >= 1.0) discard;
  float soft = exp(-3.0 * reach) * (1.0 - reach);
  float disc = 0.55 * (1.0 - smoothstep(0.62, 1.0, sqrt(reach))) * (0.8 + 0.2 * reach);
  gl_FragColor = vec4(vLight * mix(soft, disc, smoothstep(0.3, 0.9, vBlur)), 1.0);
  #include <tonemapping_fragment>
  #include <colorspace_fragment>
}`;

export const LINE_VERTEX = /* glsl */ `
uniform vec2 uAt;
uniform float uHalf;
varying vec2 vAt;
void main() {
  vAt = vec2(position.x - uAt.x, position.y);
  gl_Position = vec4(position.x, uAt.y + position.y * uHalf, 0.0, 1.0);
}`;

export const LINE_FRAGMENT = /* glsl */ `
uniform vec3 uGold;
uniform float uLight;
uniform vec2 uPixels;
varying vec2 vAt;
void main() {
  vec2 px = vAt * uPixels;
  float line = exp(-px.y * px.y / 1.5) + 0.18 * exp(-abs(px.y) / 5.0);
  float fall = 0.3 * exp(-abs(px.x) / (0.6 * uPixels.x)) + 0.7 * exp(-abs(px.x) / (0.12 * uPixels.x));
  float glow = 1.4 * exp(-dot(px, px) / 300.0) + 0.6 * exp(-length(px) / 9.0);
  gl_FragColor = vec4(uGold * uLight * (line * fall + glow), 1.0);
  #include <tonemapping_fragment>
  #include <colorspace_fragment>
}`;

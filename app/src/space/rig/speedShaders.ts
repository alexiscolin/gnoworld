// The speed's shaders (speed.ts): the blur draws the stage's picture towards where the camera goes, then grades it as the screen
// would have (tone mapping, colour space); the dust wraps its grains in a box round the eye that the eye's way scales.

export const BLUR_VERTEX = /* glsl */ `
varying vec2 vUv;
void main() {
  vUv = uv;
  gl_Position = vec4(position.xy, 0.0, 1.0);
}`;

export const BLUR_FRAGMENT = /* glsl */ `
uniform sampler2D tMap;
uniform vec2 uCentre;
uniform float uReach;
varying vec2 vUv;
void main() {
  vec2 away = vUv - uCentre;
  vec4 sum = vec4(0.0);
  for (int i = 0; i < 12; i++) sum += texture2D(tMap, uCentre + away * (1.0 - uReach * float(i) / 11.0));
  gl_FragColor = sum / 12.0;
  #include <tonemapping_fragment>
  #include <colorspace_fragment>
}`;

export const DUST_VERTEX = /* glsl */ `
uniform vec3 uEye;
uniform float uScale;
varying float vNear;
void main() {
  vec3 at = cameraPosition + (fract(position - uEye) - 0.5) * uScale;
  vec4 seen = viewMatrix * vec4(at, 1.0);
  vNear = smoothstep(uScale * 0.5, uScale * 0.12, -seen.z) * step(0.0, -seen.z);
  gl_PointSize = 1.6;
  gl_Position = projectionMatrix * seen;
}`;

export const DUST_FRAGMENT = /* glsl */ `
uniform float uGain;
varying float vNear;
void main() {
  float disc = 1.0 - smoothstep(0.3, 0.5, length(gl_PointCoord - 0.5));
  gl_FragColor = vec4(vec3(0.9, 0.92, 1.0) * disc * vNear * uGain, 1.0);
}`;

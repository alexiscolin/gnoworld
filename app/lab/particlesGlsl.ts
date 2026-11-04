// The particles study's shaders (particlesLook.ts): each particle a small solid sphere, lit from one side and opaque, so the mass reads as
// matter in volume and a near one hides a far one; dust dimmer; light falling with distance. And the chosen cluster's line of light, a thin
// horizontal band through its brightest world, with a glow where they cross.

export const POINT_VERTEX = /* glsl */ `
attribute vec3 aSize;
attribute float aCluster;
uniform float uFocal;
uniform float uLeast;
uniform float uRatio;
uniform float uChosen;
uniform float uNear;
uniform float uFarAt;
uniform float uFar;
uniform float uLight;
uniform float uDustLight;
uniform float uDim;
uniform float uGoldLift;
uniform float uWarm;
uniform vec3 uGold;
uniform vec3 uPeach;
uniform vec3 uRose;
uniform vec3 uEarth;
varying vec3 vColour;
void main() {
  vec4 seen = modelViewMatrix * vec4(position, 1.0);
  float distance = max(-seen.z, 0.01);
  float size = max(aSize.x * uFocal / distance, uLeast);
  float chosen = 1.0 - step(0.5, abs(aCluster - uChosen));
  float dust = step(2.5, aSize.y) * (1.0 - step(3.5, aSize.y));
  float earth = step(3.5, aSize.y);
  vec3 tint = mix(vec3(0.86, 0.7, 0.64), mix(uPeach, uRose, aSize.z), uWarm);
  vec3 colour = mix(tint * uDim, uGold * uGoldLift, chosen * (1.0 - dust * 0.4));
  colour = mix(colour, uEarth, earth);
  float depth = mix(1.0, uFar, smoothstep(uNear, uFarAt, distance));
  vColour = colour * uLight * depth * mix(1.0, uDustLight, dust) * min(1.0, aSize.x * uFocal / distance / uLeast);
  gl_Position = projectionMatrix * seen;
  gl_PointSize = 2.0 * size * uRatio;
}`;

// A sphere's disc: lit from the upper left, a little light on its shadowed side from the mass around it.
export const POINT_FRAGMENT = /* glsl */ `
varying vec3 vColour;
void main() {
  vec2 at = gl_PointCoord * 2.0 - 1.0;
  float reach = dot(at, at);
  if (reach >= 1.0) discard;
  vec3 normal = vec3(at.x, -at.y, sqrt(1.0 - reach));
  float lit = max(dot(normal, normalize(vec3(-0.45, 0.55, 0.7))), 0.0);
  gl_FragColor = vec4(vColour * (0.28 + 0.9 * lit + 0.25 * pow(lit, 12.0)), 1.0);
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

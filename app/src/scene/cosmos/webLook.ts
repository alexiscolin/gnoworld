// How the whole cosmos's points and lines are drawn (web.ts): added light, behind every body, each world where its orbit holds it, as the
// ladder's points have it (`ORBITING`).
import { AdditiveBlending, ShaderMaterial } from "three";
import { ORBITING } from "./dots.ts";

const POINT_LIGHT = 1.1;
const LINE_LIGHT = 0.16;

const POINT_VERTEX = /* glsl */ `
attribute vec3 aCircle;
attribute vec3 aTint;
attribute vec2 aSoft;
uniform float uSeconds;
uniform float uRatio;
uniform float uShare;
uniform float uCalm;
varying vec3 vLight;
${ORBITING}
void main() {
  vLight = aTint * aSoft.y * uShare * uCalm * ${POINT_LIGHT.toFixed(2)};
  gl_Position = projectionMatrix * modelViewMatrix * vec4(position + orbiting(aCircle, uSeconds) * aCircle.x, 1.0);
  gl_Position.z = gl_Position.w * 0.99998;
  gl_PointSize = 2.0 * aSoft.x * uRatio;
}`;

// A soft round with no edge, most of its light at its heart.
const POINT_FRAGMENT = /* glsl */ `
varying vec3 vLight;
void main() {
  vec2 at = gl_PointCoord * 2.0 - 1.0;
  float reach = dot(at, at);
  if (reach >= 1.0) discard;
  gl_FragColor = vec4(vLight * exp(-3.0 * reach) * (1.0 - reach), 1.0);
  #include <tonemapping_fragment>
  #include <colorspace_fragment>
}`;

const LINE_VERTEX = /* glsl */ `
attribute vec3 aCircle;
attribute vec3 aTint;
attribute vec2 aSoft;
uniform float uSeconds;
uniform float uShare;
uniform float uCalm;
varying vec3 vLight;
${ORBITING}
void main() {
  vLight = aTint * aSoft.y * uShare * uCalm * ${LINE_LIGHT.toFixed(2)};
  gl_Position = projectionMatrix * modelViewMatrix * vec4(position + orbiting(aCircle, uSeconds) * aCircle.x, 1.0);
  gl_Position.z = gl_Position.w * 0.99998;
}`;

const LINE_FRAGMENT = /* glsl */ `
varying vec3 vLight;
void main() {
  gl_FragColor = vec4(vLight, 1.0);
  #include <tonemapping_fragment>
  #include <colorspace_fragment>
}`;

const added = (vertexShader: string, fragmentShader: string, uniforms: Record<string, { value: number }>) =>
  new ShaderMaterial({
    blending: AdditiveBlending,
    depthWrite: false,
    transparent: true,
    uniforms,
    vertexShader,
    fragmentShader,
  });

type Uniforms = Record<string, { value: number }>;

/** The points' material: a soft round each, its size and light from the look, all of it by the share. */
export const pointLook = (uniforms: Uniforms) => added(POINT_VERTEX, POINT_FRAGMENT, uniforms);

/** The lines' material: a thin line each, read through an index from the points' own buffers: its ends' light and colour. */
export const lineLook = (uniforms: Uniforms) => added(LINE_VERTEX, LINE_FRAGMENT, uniforms);

// How the whole cosmos's mass is drawn (web.ts; 7u): each particle a small opaque sphere lit from one side, so a near one hides a far
// one, its colour its kind's from the palette, fading towards the ground with distance; it glides from where the last mass held it. Near
// the page's text it thins out, each particle kept by its world's own draw against the text's field, and smaller (offTheBox.ts, 8m). The
// ground behind it, and the chosen clump's line of light, a thin horizontal band.
import { AdditiveBlending, Color, Mesh, PlaneGeometry, ShaderMaterial } from "three";

const POINT_VERTEX = /* glsl */ `
attribute vec3 aSize;
attribute vec3 aFrom;
attribute float aClump;
uniform vec3 uKind[6];
uniform vec3 uTouch[6];
uniform float uHalfHeight;
uniform float uRatio;
uniform float uGlide;
uniform float uChosen;
uniform float uLift;
uniform float uNear;
uniform float uFar;
uniform float uFarLight;
varying vec3 vColour;
varying vec3 vTouch;
varying float vDepth;
void main() {
  vec3 at = mix(aFrom, position, uGlide);
  vec4 seen = modelViewMatrix * vec4(at, 1.0);
  float distance = max(-seen.z, 0.01);
  float size = aSize.x * projectionMatrix[1][1] * uHalfHeight / distance;
  vec3 kind = uKind[int(aSize.y + 0.5)];
  float chosen = 1.0 - step(0.5, abs(aClump - uChosen));
  float lift = (0.8 + 0.4 * aSize.z) * mix(1.0, uLift, chosen);
  vColour = kind * lift;
  vTouch = uTouch[int(aSize.y + 0.5)] * lift;
  vDepth = mix(1.0, uFarLight, smoothstep(uNear, uFar, distance)) * min(1.0, size / 0.8);
  gl_Position = projectionMatrix * seen;
  gl_PointSize = 2.0 * max(size, 0.8) * uRatio;
  float kept = offField((gl_Position.xy / gl_Position.w * 0.5 + 0.5) * offBuffer, gl_PointSize * 0.5);
  if (fract(aSize.z * 113.0) >= kept) gl_Position = vec4(0.0, 0.0, 2.0, 1.0);
  gl_PointSize *= mix(0.6, 1.0, kept);
}`;

// A sphere's disc, lit from the upper left, `uShadow` of the light on its far side from the mass around it, its kind's touch at its rim;
// its far ones the ground's.
const POINT_FRAGMENT = /* glsl */ `
uniform vec3 uGround;
uniform float uShadow;
uniform float uShare;
uniform float uTouchShare;
varying vec3 vColour;
varying vec3 vTouch;
varying float vDepth;
void main() {
  vec2 at = gl_PointCoord * 2.0 - 1.0;
  float reach = dot(at, at);
  if (reach >= 1.0) discard;
  vec3 normal = vec3(at.x, -at.y, sqrt(1.0 - reach));
  float lit = max(dot(normal, vec3(-0.45, 0.55, 0.7)), 0.0);
  vec3 colour = mix(vColour, vTouch, uTouchShare * pow(1.0 - normal.z, 1.2));
  vec3 shaded = colour * (uShadow + (1.18 - uShadow) * lit + 0.25 * pow(lit, 12.0));
  gl_FragColor = vec4(mix(uGround, shaded, vDepth) * uShare + uGround * (1.0 - uShare), 1.0);
  #include <tonemapping_fragment>
  #include <colorspace_fragment>
  #include <dithering_fragment>
}`;

const GROUND_VERTEX = /* glsl */ `
void main() {
  gl_Position = vec4(position.xy, 0.0, 1.0);
}`;

// The view's ground under the mass, as much of it as the whole cosmos's share: the sky's light is added over it.
const GROUND_FRAGMENT = /* glsl */ `
uniform vec3 uGround;
uniform float uShare;
void main() {
  gl_FragColor = vec4(uGround * uShare, 1.0);
  #include <colorspace_fragment>
}`;

const LINE_VERTEX = /* glsl */ `
uniform vec2 uAt;
uniform float uHalf;
varying vec2 vAt;
void main() {
  vAt = vec2(position.x - uAt.x, position.y);
  gl_Position = vec4(position.x, uAt.y + position.y * uHalf, 0.0, 1.0);
}`;

const LINE_FRAGMENT = /* glsl */ `
uniform vec3 uTone;
uniform float uLight;
uniform vec2 uPixels;
varying vec2 vAt;
void main() {
  vec2 px = vAt * uPixels;
  float line = exp(-px.y * px.y / 1.5) + 0.18 * exp(-abs(px.y) / 5.0);
  float fall = 0.3 * exp(-abs(px.x) / (0.6 * uPixels.x)) + 0.7 * exp(-abs(px.x) / (0.12 * uPixels.x));
  float glow = 1.4 * exp(-dot(px, px) / 300.0) + 0.6 * exp(-length(px) / 9.0);
  gl_FragColor = vec4(uTone * uLight * (line * fall + glow), 1.0);
  #include <tonemapping_fragment>
  #include <colorspace_fragment>
  #include <dithering_fragment>
}`;

type Uniforms = Record<string, { value: number | Color | Color[] | { x: number; y: number } }>;

// How much brighter the chosen clump stands.
const LIFT = 1.7;

/** The particles' uniforms: each frame, look and palette writes its own. */
export const massUniforms = () => ({
  ...{
    uHalfHeight: { value: 1 },
    uRatio: { value: 1 },
    uShare: { value: 0 },
    uGlide: { value: 1 },
    uChosen: { value: -1 },
  },
  ...{
    uLift: { value: LIFT },
    uNear: { value: 1 },
    uFar: { value: 2 },
    uGround: { value: new Color() },
  },
  ...{ uKind: { value: [] as Color[] }, uTouch: { value: [] as Color[] }, uTouchShare: { value: 0 } },
  ...{ uShadow: { value: 0 }, uFarLight: { value: 1 } },
});

/** The particles' material: depth-tested and written, its light whole, thinned out round the page's text (offTheBox.ts). */
export const massLook = (uniforms: Uniforms) =>
  new ShaderMaterial({ uniforms, vertexShader: POINT_VERTEX, fragmentShader: POINT_FRAGMENT, transparent: true });

/** The ground: opaque and drawn first, under the sky's picture (-2), so the mass draws over it and the sky adds its light after. */
export function groundOf(uniforms: Uniforms): Mesh<PlaneGeometry, ShaderMaterial> {
  const ground = new Mesh(new PlaneGeometry(2, 2), groundLook(uniforms));
  ground.frustumCulled = false;
  ground.renderOrder = -3;
  return ground;
}

const groundLook = (uniforms: Uniforms) =>
  new ShaderMaterial({
    uniforms,
    vertexShader: GROUND_VERTEX,
    fragmentShader: GROUND_FRAGMENT,
    depthTest: false,
    depthWrite: false,
    transparent: false,
  });

/** The line of light's: added light over the frame, no depth. */
export const lineLook = (uniforms: Uniforms) =>
  new ShaderMaterial({
    uniforms,
    vertexShader: LINE_VERTEX,
    fragmentShader: LINE_FRAGMENT,
    blending: AdditiveBlending,
    depthWrite: false,
    depthTest: false,
    transparent: true,
  });

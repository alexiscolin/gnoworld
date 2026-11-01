// The realism page's own sky, until 7a2's lands: crisp stars as points and one star, for a view needs something to be lit by and set against.
import {
  AdditiveBlending,
  BufferAttribute,
  BufferGeometry,
  Mesh,
  PlaneGeometry,
  Points,
  ShaderMaterial,
  type Camera,
  type Vector3,
} from "three";

const FAR = 1500;
const STAR_DISTANCE = 1400;
const STAR_SIZE = 900;
const COUNT = 2600;

const POINT_VERTEX = /* glsl */ `
attribute float size;
attribute vec3 tint;
varying vec3 vTint;
uniform float ratio;
void main() {
  vTint = tint;
  gl_PointSize = size * ratio;
  gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
}
`;

const POINT_FRAGMENT = /* glsl */ `
varying vec3 vTint;
void main() {
  float d = length(gl_PointCoord - 0.5) * 2.0;
  gl_FragColor = vec4(vTint * smoothstep(1.0, 0.25, d), 1.0);
  #include <colorspace_fragment>
}
`;

const STAR_VERTEX = /* glsl */ `
varying vec2 vPlace;
void main() {
  vPlace = uv * 2.0 - 1.0;
  gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
}
`;

const STAR_FRAGMENT = /* glsl */ `
varying vec2 vPlace;
void main() {
  float d = length(vPlace);
  float fall = 1.0 - smoothstep(0.7, 1.0, d);
  float core = smoothstep(0.022, 0.012, d) * 5.0;
  float glow = exp(-d * 60.0) * 2.2 + exp(-d * 16.0) * 0.34 + exp(-d * 5.0) * 0.05;
  vec3 warm = mix(vec3(1.0, 0.56, 0.24), vec3(1.0, 0.86, 0.68), exp(-d * 14.0));
  gl_FragColor = vec4((warm * glow + core) * fall, 1.0);
  #include <tonemapping_fragment>
  #include <colorspace_fragment>
}
`;

// A small LCG: the sky is the same at every visit, and no chance reaches the page.
const stepped = (state: number) => (Math.imul(state, 1664525) + 1013904223) >>> 0;

/** A sphere of crisp stars around the origin. */
export function starField(ratio: number): Points<BufferGeometry, ShaderMaterial> {
  const positions = new Float32Array(COUNT * 3);
  const sizes = new Float32Array(COUNT);
  const tints = new Float32Array(COUNT * 3);
  let state = 2026;
  const next = () => {
    state = stepped(state);
    return state / 4294967296;
  };
  for (let i = 0; i < COUNT; i += 1) {
    const height = next() * 2 - 1;
    const round = Math.sqrt(1 - height * height);
    const angle = next() * Math.PI * 2;
    positions.set([FAR * round * Math.cos(angle), FAR * height, FAR * round * Math.sin(angle)], i * 3);
    const bright = next() ** 5;
    sizes[i] = 1.1 + bright * 2.4;
    const warmth = next();
    const level = 0.22 + bright * 0.78;
    tints.set([level * (0.86 + warmth * 0.14), level * 0.92, level * (1 - warmth * 0.18)], i * 3);
  }
  const geometry = new BufferGeometry();
  geometry.setAttribute("position", new BufferAttribute(positions, 3));
  geometry.setAttribute("size", new BufferAttribute(sizes, 1));
  geometry.setAttribute("tint", new BufferAttribute(tints, 3));
  const material = new ShaderMaterial({
    vertexShader: POINT_VERTEX,
    fragmentShader: POINT_FRAGMENT,
    uniforms: { ratio: { value: ratio } },
    transparent: true,
    depthWrite: false,
    blending: AdditiveBlending,
    toneMapped: false,
  });
  const points = new Points(geometry, material);
  points.frustumCulled = false;
  return points;
}

/** A star far off along `direction`, seen from `camera`, facing it. */
export function starSprite(camera: Camera, direction: Vector3): Mesh<PlaneGeometry, ShaderMaterial> {
  const material = new ShaderMaterial({
    vertexShader: STAR_VERTEX,
    fragmentShader: STAR_FRAGMENT,
    transparent: true,
    depthWrite: false,
    blending: AdditiveBlending,
  });
  const mesh = new Mesh(new PlaneGeometry(STAR_SIZE, STAR_SIZE), material);
  mesh.position.copy(camera.position).addScaledVector(direction, STAR_DISTANCE);
  mesh.quaternion.copy(camera.quaternion);
  return mesh;
}

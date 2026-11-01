// One nebula made two ways, for Alexis to compare by eye (the plan, question 27). Computed: noise baked once into two targets, far gas and
// near dust. Image: ESA/Hubble's Carina, its stars taken out, warped, crushed to near-black and masked by the same field. Both reach the
// screen through one shader, as two layers that slide apart as the eye moves. The method that loses is deleted with this file's half.
import {
  BufferAttribute,
  BufferGeometry,
  LinearFilter,
  Mesh,
  OrthographicCamera,
  Scene,
  ShaderMaterial,
  Vector2,
  WebGLRenderTarget,
  type Texture,
  type WebGLRenderer,
} from "three";
import { FIELD } from "../src/scene/planet/chunks.ts";

const BAKE_WIDTH = 1024;
const BAKE_HEIGHT = 512;
const OVER_SCREEN = new Float32Array([-1, -1, 0, 3, -1, 0, -1, 3, 0]);

const SCREEN_VERTEX = /* glsl */ `
varying vec2 vPlace;
void main() {
  vPlace = position.xy * 0.5 + 0.5;
  gl_Position = vec4(position.xy, 1.0, 1.0);
}
`;

const BAKE_FRAGMENT = /* glsl */ `
uniform float layer;
varying vec2 vPlace;
${FIELD}
vec3 layered(vec3 p) {
  vec3 sum = vec3(0.0);
  float reach = 0.5;
  for (int i = 0; i < 5; i++) {
    sum += reach * field(p);
    p = p * 2.03 + vec3(1.7, 9.2, 3.1);
    reach *= 0.5;
  }
  return sum;
}
void main() {
  vec3 p = vec3(vPlace * vec2(2.6, 1.3), 2.4 + layer * 5.0);
  vec3 q = layered(p);
  vec3 r = layered(p + 1.1 * q + vec3(5.2, 1.3, 0.0));
  vec3 s = layered(p * 1.6 + 1.4 * r);
  if (layer < 0.5) {
    float gas = smoothstep(-0.34, 0.5, r.x + 0.5 * s.x);
    float bright = smoothstep(0.0, 0.62, s.y + 0.4 * r.z);
    vec3 hydrogen = vec3(0.7, 0.2, 0.16);
    vec3 oxygen = vec3(0.2, 0.52, 0.56);
    vec3 sulphur = vec3(0.92, 0.6, 0.3);
    vec3 colour = mix(hydrogen, oxygen, smoothstep(-0.3, 0.34, q.y + 0.3 * s.z));
    colour = mix(colour, sulphur, smoothstep(0.0, 0.46, q.z - 0.2 * r.y));
    colour = mix(colour, vec3(0.92, 0.9, 0.86), bright * bright * 0.6);
    gl_FragColor = vec4(sqrt(colour * gas * gas * (0.35 + bright)), 1.0);
  } else {
    float dust = smoothstep(0.04, 0.5, abs(s.z) * 1.6 - 0.2 + 0.5 * r.x) * smoothstep(-0.1, 0.4, q.x + 0.3);
    gl_FragColor = vec4(sqrt(mix(vec3(0.03, 0.014, 0.008), vec3(0.11, 0.05, 0.03), r.z * 0.5 + 0.5)), dust);
  }
}
`;

const SKY_FRAGMENT = /* glsl */ `
uniform sampler2D farLayer;
uniform sampler2D nearLayer;
uniform float image;
uniform float aspect;
uniform vec2 eye;
varying vec2 vPlace;
${FIELD}
float masked(vec2 at) {
  vec2 centre = (at - vec2(0.5, 0.52)) * vec2(aspect / 1.6, 1.0);
  float wander = field(vec3(at * 1.5, 3.0)).x * 0.32;
  return smoothstep(0.62, 0.08, length(centre * vec2(0.82, 1.2)) - wander);
}
vec3 fromImage(vec2 at) {
  vec2 bent = at * vec2(0.66, 0.78) + vec2(0.08, 0.1) + field(vec3(at * 1.4, 7.0)).xy * 0.035;
  vec3 c = texture2D(farLayer, bent).rgb;
  float level = dot(c, vec3(0.3, 0.6, 0.1));
  return c * c * (0.55 + 1.3 * level) * 1.7 * smoothstep(0.015, 0.3, level);
}
vec3 baked(vec2 at) {
  vec3 far = texture2D(farLayer, at * 0.86 + 0.07).rgb;
  vec4 near = texture2D(nearLayer, at * 0.8 + 0.1 + eye * 0.02);
  return mix(far * far, near.rgb * near.rgb, near.a * 0.8) * 1.5;
}
float grain(vec2 at) {
  uvec2 v = uvec2(at);
  v = v * 1664525u + 1013904223u;
  v.x += v.y * 1103515245u;
  v.y ^= v.x >> 13u;
  return float((v.x ^ v.y) & 255u) / 255.0 - 0.5;
}
void main() {
  vec2 at = vPlace + eye * 0.012;
  vec3 colour = image > 0.5 ? fromImage(at) : baked(at);
  gl_FragColor = vec4(colour * masked(at) * 0.8, 1.0);
  #include <tonemapping_fragment>
  #include <colorspace_fragment>
  gl_FragColor.rgb += grain(gl_FragCoord.xy) / 200.0;
}
`;

const screenGeometry = () => new BufferGeometry().setAttribute("position", new BufferAttribute(OVER_SCREEN, 3));

function bakeLayer(renderer: WebGLRenderer, layer: number): WebGLRenderTarget {
  const target = new WebGLRenderTarget(BAKE_WIDTH, BAKE_HEIGHT, {
    depthBuffer: false,
    minFilter: LinearFilter,
    magFilter: LinearFilter,
  });
  const material = new ShaderMaterial({
    vertexShader: SCREEN_VERTEX,
    fragmentShader: BAKE_FRAGMENT,
    uniforms: { layer: { value: layer } },
    depthTest: false,
    depthWrite: false,
    toneMapped: false,
  });
  const geometry = screenGeometry();
  const scene = new Scene();
  const mesh = new Mesh(geometry, material);
  mesh.frustumCulled = false;
  scene.add(mesh);
  renderer.setRenderTarget(target);
  renderer.render(scene, new OrthographicCamera());
  renderer.setRenderTarget(null);
  material.dispose();
  geometry.dispose();
  return target;
}

export interface Nebula {
  readonly mesh: Mesh<BufferGeometry, ShaderMaterial>;
  /** Bytes of what was baked. */
  readonly targetBytes: number;
  /** The real image it reads, if it reads one. */
  readonly texture: Texture | undefined;
  look(eyeX: number, eyeY: number, aspect: number): void;
  dispose(): void;
}

function skyMesh(far: Texture, near: Texture, image: boolean): Mesh<BufferGeometry, ShaderMaterial> {
  const material = new ShaderMaterial({
    vertexShader: SCREEN_VERTEX,
    fragmentShader: SKY_FRAGMENT,
    uniforms: {
      farLayer: { value: far },
      nearLayer: { value: near },
      image: { value: image ? 1 : 0 },
      aspect: { value: 1.6 },
      eye: { value: new Vector2() },
    },
    depthTest: false,
    depthWrite: false,
  });
  const mesh = new Mesh(screenGeometry(), material);
  mesh.frustumCulled = false;
  mesh.renderOrder = -2;
  return mesh;
}

function nebulaOf(
  mesh: Mesh<BufferGeometry, ShaderMaterial>,
  texture: Texture | undefined,
  targets: readonly WebGLRenderTarget[],
): Nebula {
  const eye = mesh.material.uniforms["eye"]?.value as Vector2;
  const aspect = mesh.material.uniforms["aspect"];
  return {
    mesh,
    texture,
    targetBytes: targets.length * BAKE_WIDTH * BAKE_HEIGHT * 4,
    look: (eyeX, eyeY, ratio) => {
      eye.set(eyeX, eyeY);
      if (aspect !== undefined) aspect.value = ratio;
    },
    dispose: () => {
      for (const target of targets) target.dispose();
      mesh.geometry.dispose();
      mesh.material.dispose();
    },
  };
}

/** The nebula baked from noise, at load: seconds on a software GPU, a frame or two on a real one. */
export function computedNebula(renderer: WebGLRenderer): Nebula {
  const far = bakeLayer(renderer, 0);
  const near = bakeLayer(renderer, 1);
  return nebulaOf(skyMesh(far.texture, near.texture, false), undefined, [far, near]);
}

/** The nebula from a real image. */
export const imageNebula = (carina: Texture): Nebula => nebulaOf(skyMesh(carina, carina, true), carina, []);

// The nebula (D510): the soft coloured clouds behind the stars, one sphere round the eye drawn first. A function of the direction alone: it
// never jumps in a dive, and holds still whatever the motion setting says, so its noise is laid once on a cube map and a frame reads it
// (baked again when a lost context comes back); where half floats cannot be drawn to, one pass of noise per pixel as before.
import {
  BackSide,
  BoxGeometry,
  CubeCamera,
  HalfFloatType,
  IcosahedronGeometry,
  Mesh,
  Scene,
  ShaderMaterial,
  WebGLCubeRenderTarget,
  type IUniform,
  type WebGLRenderer,
} from "three";
import { ADDITIVE } from "../additive.ts";
import { NEBULA_BAKED_FRAGMENT, NEBULA_BAKE_FRAGMENT, NEBULA_FRAGMENT, NEBULA_VERTEX } from "../shaders/nebula.ts";

const FACE = 512;
const BAKE_VERTEX =
  "varying vec3 vDir; void main() { vDir = position; gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0); }";

/** The clouds on a cube map of half floats (their levels are far under one of 255). */
function bakeClouds(renderer: WebGLRenderer): WebGLCubeRenderTarget {
  const target = new WebGLCubeRenderTarget(FACE, { type: HalfFloatType, generateMipmaps: false });
  const scene = new Scene();
  const box = new Mesh(
    new BoxGeometry(2, 2, 2),
    new ShaderMaterial({ vertexShader: BAKE_VERTEX, fragmentShader: NEBULA_BAKE_FRAGMENT, side: BackSide }),
  );
  scene.add(box);
  new CubeCamera(0.1, 10, target).update(renderer, scene);
  box.geometry.dispose();
  box.material.dispose();
  return target;
}

const canBake = (renderer: WebGLRenderer): boolean =>
  renderer.extensions.has("EXT_color_buffer_float") || renderer.extensions.has("EXT_color_buffer_half_float");

/** The clouds, `uniforms` carrying the sky's gain (uGain). */
export function nebulaOf(uniforms: Record<string, IUniform>, bake = bakeClouds): Mesh {
  const clouds: IUniform = { value: null };
  const make = (fragmentShader: string, extra: Record<string, IUniform>) =>
    new ShaderMaterial({
      uniforms: { ...uniforms, ...extra },
      vertexShader: NEBULA_VERTEX,
      fragmentShader,
      transparent: true,
      depthWrite: false,
      depthTest: false,
      side: BackSide,
      ...ADDITIVE,
    });
  const live = make(NEBULA_FRAGMENT, {});
  const baked = make(NEBULA_BAKED_FRAGMENT, { uClouds: clouds });
  const mesh = new Mesh(new IcosahedronGeometry(1, 2), live);
  mesh.frustumCulled = false;
  mesh.renderOrder = -11;
  let target: WebGLCubeRenderTarget | undefined;
  mesh.onBeforeRender = (renderer) => {
    // The first frame draws live; a restored context holds none of the cube (three starts its properties anew), so it is laid again.
    if (!canBake(renderer) || renderer.getContext().isContextLost()) return;
    if (target !== undefined && renderer.properties.has(target.texture)) return;
    target?.dispose();
    target = bake(renderer);
    clouds.value = target.texture;
    mesh.material = baked;
  };
  let freed = false;
  const free = (): void => {
    if (freed) return;
    freed = true;
    target?.dispose();
    live.dispose();
    baked.dispose();
  };
  live.addEventListener("dispose", free);
  baked.addEventListener("dispose", free);
  return mesh;
}

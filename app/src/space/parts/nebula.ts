// The nebula (D510): the soft coloured clouds behind the stars, one sphere round the eye drawn first, one pass of noise per pixel. A
// function of the direction alone: it never jumps in a dive, and holds still whatever the motion setting says.
import { IcosahedronGeometry, Mesh, ShaderMaterial, BackSide, type IUniform } from "three";
import { ADDITIVE } from "../additive.ts";
import { NEBULA_FRAGMENT, NEBULA_VERTEX } from "../shaders/nebula.ts";

/** The clouds, `uniforms` carrying the sky's gain (uGain). */
export function nebulaOf(uniforms: Record<string, IUniform>): Mesh {
  const material = new ShaderMaterial({
    uniforms,
    vertexShader: NEBULA_VERTEX,
    fragmentShader: NEBULA_FRAGMENT,
    transparent: true,
    depthWrite: false,
    depthTest: false,
    side: BackSide,
    ...ADDITIVE,
  });
  const mesh = new Mesh(new IcosahedronGeometry(1, 2), material);
  mesh.frustumCulled = false;
  mesh.renderOrder = -11;
  return mesh;
}

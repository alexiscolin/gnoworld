// The belt (part 7x): every station that stands no body round the Earth is a light at its own place, one draw for all of them, its size
// from the station's and held to a few pixels, so a thousand read as a far ring of lights and none is dropped without a trace.
import { AdditiveBlending, Points, ShaderMaterial, type BufferGeometry } from "three";
import { cloudOf } from "../cosmos/cloud.ts";

const VERTEX = /* glsl */ `
attribute float size;
uniform float scale;
void main() {
  vec4 seen = modelViewMatrix * vec4(position, 1.0);
  gl_PointSize = clamp(size * scale / -seen.z, 1.5, 3.5);
  gl_Position = projectionMatrix * seen;
}
`;

const FRAGMENT = /* glsl */ `
void main() {
  float d = length(gl_PointCoord - 0.5) * 2.0;
  gl_FragColor = vec4(vec3(1.0, 0.86, 0.66) * 0.75 * (1.0 - smoothstep(0.2, 1.0, d)), 1.0);
  #include <colorspace_fragment>
}
`;

/** The belt's lights at `places` (x, y, z each, round the group's origin), each `sizes` wide in world units. */
export function beltOf(places: Float32Array, sizes: Float32Array): Points<BufferGeometry, ShaderMaterial> {
  const cloud = cloudOf(sizes.length, { position: 3, size: 1 });
  cloud.attributes.position.array.set(places);
  cloud.attributes.size.array.set(sizes);
  cloud.commit(sizes.length);
  const material = new ShaderMaterial({
    vertexShader: VERTEX,
    fragmentShader: FRAGMENT,
    uniforms: { scale: { value: 1 } },
    transparent: true,
    depthWrite: false,
    blending: AdditiveBlending,
  });
  const points = new Points(cloud.geometry, material);
  points.frustumCulled = false;
  return points;
}

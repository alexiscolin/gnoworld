import { LOW_SUN, shadowMarch } from "./shadowMarch.ts";

// The coarse relief a world's shadows are cast over: its broad fBm and its big craters, the low octaves only (the `relieved` of its main), and
// a few steps toward the sun over it, as a ray above a curved ground. Near the terminator, on the world seen close, never on the Low setting.
export const SHADOWS = /* glsl */ `
${LOW_SUN}
float coarseAt(vec3 at, float pixel) {
  vec4 ground = fbm(at + shape.warp * field(at * 1.1 + offset.yzx) + offset, shape.scale, pixel, shape.erosion, min(shape.octaves, 3.0));
  return ground.z / ground.y + (shape.craters > 0.0 ? 0.8 * cratersAt(at + offset, shape.scale * 4.0, pixel) : 0.0);
}
${shadowMarch("castOver", { steps: "4", soft: "0.6", extra: ", float pixel", read: "coarseAt(p, pixel)" })}
float shadowOf(vec3 at, float angle, float pixel, float near, float wet) {
  if (depth < 0.5 || banded > 0.5 || relief < 0.004 || wet > 0.5 || near <= 0.0) return 1.0;
  vec3 toSun = spin * turned(vSun, angle);
  float edge = near * lowSun(dot(at, toSun));
  return edge > 0.0 ? mix(1.0, castOver(at, toSun, coarseAt(at, pixel), relief * 1.2, pixel), edge * 0.7) : 1.0;
}
`;

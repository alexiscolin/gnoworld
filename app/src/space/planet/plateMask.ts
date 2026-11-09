// Where the page's plate stands on the screen (D490), for the lights that must keep off its words: the plate's own uniforms, shared with the
// glare past a planet's limb and with the moons, which fade out toward the plate's text instead of washing or covering it.
import { Vector4, type IUniform } from "three";

export interface PlateMask {
  readonly uBox: IUniform<Vector4>;
  readonly uFade: IUniform<number>;
  readonly uShown: IUniform<number>;
  readonly uHeight: IUniform<number>;
  readonly uRound: IUniform<number>;
}

/** A stage's plate uniforms: the box, where its words end, how much it shows, the buffer's height, all in the buffer's pixels. */
export const newPlateMask = (): PlateMask => ({
  uBox: { value: new Vector4() },
  uFade: { value: 0 },
  uShown: { value: 0 },
  uHeight: { value: 1 },
  uRound: { value: 18 },
});

/** `plateClear()`: 0 deep inside the plate's rounded box, 1 well outside it, between over a soft margin that follows its rounding. */
export const PLATE_CLEAR = /* glsl */ `
uniform vec4 uBox;
uniform float uFade, uShown, uHeight, uRound;
float plateClear() {
  vec2 p = vec2(gl_FragCoord.x, uHeight - gl_FragCoord.y);
  vec2 q = abs(p - (uBox.xy + uBox.zw) * 0.5) - (uBox.zw - uBox.xy) * 0.5 + uRound;
  float edge = length(max(q, 0.0)) + min(max(q.x, q.y), 0.0) - uRound;
  float width = max(uBox.z - uFade, 24.0);
  return 1.0 - uShown * (1.0 - smoothstep(-width, width * 1.5, edge));
}
`;

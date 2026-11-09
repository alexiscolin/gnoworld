// Light added to what is under it, and leaving the canvas's alpha alone: three's additive blending adds the glow's alpha too, which on the
// chat's transparent canvas (SpaceOptions.inChat) would paint each glow's whole quad opaque black. Here a glow only adds its colour.
import { CustomBlending, OneFactor, SrcAlphaFactor, ZeroFactor } from "three";

export const ADDITIVE = {
  blending: CustomBlending,
  blendSrc: SrcAlphaFactor,
  blendDst: OneFactor,
  blendSrcAlpha: ZeroFactor,
  blendDstAlpha: OneFactor,
} as const;

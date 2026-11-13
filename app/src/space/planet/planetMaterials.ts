// The materials of a world's air, rings and sign halo: what `Planet` (planet.ts) adds round its surface, each its uniforms and nothing else.
import { textHash, unitOf, type PlanetLook } from "@gnoworld/core";
import {
  CustomBlending,
  OneFactor,
  OneMinusSrcAlphaFactor,
  DoubleSide,
  ShaderMaterial,
  Vector3,
  type Texture,
} from "three";
import { AIR_FRAGMENT, AIR_VERTEX } from "./airShader.ts";
import { RING_FRAGMENT, RING_VERTEX } from "./ringShader.ts";
import { HALO_FRAGMENT, HALO_VERTEX } from "./signShaders.ts";
import { working } from "./uniforms.ts";

// One number from 0 to 1 from a world's warp offset, which its seed sets: where its rings' spokes start.
const seedOf = ({ warp }: PlanetLook): number => unitOf(textHash(warp.offset.join()));

export function airMaterial(rim: NonNullable<PlanetLook["rim"]>, glow: PlanetLook["glow"]): ShaderMaterial {
  return new ShaderMaterial({
    vertexShader: AIR_VERTEX,
    fragmentShader: AIR_FRAGMENT,
    transparent: true,
    depthWrite: false,
    blending: CustomBlending,
    blendSrc: OneFactor,
    blendDst: OneMinusSrcAlphaFactor,
    uniforms: {
      sun: { value: new Vector3(1, 0, 0) },
      rimColour: { value: working(rim.colour) },
      rimThickness: { value: rim.thickness },
      limbLight: { value: 0 },
      selfLight: { value: glow?.level ?? 0 },
      faraway: { value: 0 },
      close: { value: 0 },
      arrive: { value: 1 },
    },
  });
}

export function ringMaterial(look: PlanetLook, rings: NonNullable<PlanetLook["rings"]>, map: Texture): ShaderMaterial {
  return new ShaderMaterial({
    vertexShader: RING_VERTEX,
    fragmentShader: RING_FRAGMENT,
    transparent: true,
    depthWrite: false,
    side: DoubleSide,
    blending: CustomBlending,
    blendSrc: OneFactor,
    blendDst: OneMinusSrcAlphaFactor,
    uniforms: {
      ringMap: { value: map },
      sun: { value: new Vector3(1, 0, 0) },
      ringTint: { value: working(rings.tint) },
      ringInner: { value: rings.inner },
      ringOuter: { value: rings.outer },
      ringOpacity: { value: rings.opacity },
      ringSeed: { value: seedOf(look) },
      ringTime: { value: 0 },
      faraway: { value: 0 },
      arrive: { value: 1 },
    },
  });
}

export const haloMaterial = (): ShaderMaterial =>
  new ShaderMaterial({
    vertexShader: HALO_VERTEX,
    fragmentShader: HALO_FRAGMENT,
    transparent: true,
    depthWrite: false,
    blending: CustomBlending,
    blendSrc: OneFactor,
    blendDst: OneMinusSrcAlphaFactor,
    uniforms: { signal: { value: 0 } },
  });

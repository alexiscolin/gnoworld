// The glare past a world's limb (D482), its quad's material: additive, over everything, off the page's plate once the stage hands it the
// plate's uniforms (`Planet.setPlate`, D490).
import type { PlanetLook } from "@gnoworld/core";
import { ShaderMaterial, Vector3 } from "three";
import { ADDITIVE } from "../additive.ts";
import { GLOW_FRAGMENT, GLOW_VERTEX } from "./airShader.ts";
import { newPlateMask } from "./plateMask.ts";
import { haze, working } from "./uniforms.ts";

export const glowMaterial = (rim: PlanetLook["rim"]): ShaderMaterial =>
  new ShaderMaterial({
    vertexShader: GLOW_VERTEX,
    fragmentShader: GLOW_FRAGMENT,
    transparent: true,
    depthWrite: false,
    // Its glare is a lens's, over the limb it stands at (D482).
    depthTest: false,
    ...ADDITIVE,
    uniforms: {
      sun: { value: new Vector3(1, 0, 0) },
      glowColour: { value: working(haze(rim)) },
      close: { value: 0 },
      ...newPlateMask(),
    },
  });

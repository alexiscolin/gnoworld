// The colony's finishes: its hull's plates and its habitat's glazed band from the maps drawn in the code (hull.ts), lit by its system's
// sun as metal and paint are; its windows lit on the night side alone; its lanes lit always; a dim sky for its metal to mirror.
import {
  DataTexture,
  EquirectangularReflectionMapping,
  LinearFilter,
  MeshStandardMaterial,
  SRGBColorSpace,
  type Material,
} from "three";
import type { Finish } from "./crown.ts";
import { hullMaps } from "./hull.ts";

// raw: the habitat band's share of the wheel's tube (its glass faces the mirrors), the windows' glow, the lanes' light
const BAND = [0.62, 0.8] as const;
const GLOW = 2.2;
const LANE = 2.4;
// The sky the metal sees, in texels: black, a faint band of the galaxy across it.
const SKY = { width: 64, height: 32 } as const;

/** Lights `material`'s glow on its night side alone: full where its face turns from the sun, none where it faces it. */
export function nightLit(material: MeshStandardMaterial): MeshStandardMaterial {
  material.onBeforeCompile = (shader) => {
    shader.fragmentShader = shader.fragmentShader.replace(
      "#include <emissivemap_fragment>",
      `#include <emissivemap_fragment>
#if NUM_DIR_LIGHTS > 0
  totalEmissiveRadiance *= smoothstep(0.25, -0.3, dot(normal, directionalLights[0].direction));
#endif`,
    );
  };
  material.customProgramCacheKey = () => "colony-night";
  return material;
}

// The sky: near black, a soft band of light across its middle, so the metal is never a flat black.
function skyOf(): DataTexture {
  const data = new Uint8Array(SKY.width * SKY.height * 4);
  for (let y = 0; y < SKY.height; y += 1) {
    const band = Math.exp(-(((y / SKY.height - 0.5) * 6) ** 2));
    for (let x = 0; x < SKY.width; x += 1)
      data.set([6 + band * 40, 8 + band * 42, 14 + band * 52, 255], (y * SKY.width + x) * 4);
  }
  const sky = new DataTexture(data, SKY.width, SKY.height);
  sky.mapping = EquirectangularReflectionMapping;
  sky.colorSpace = SRGBColorSpace;
  sky.magFilter = LinearFilter;
  sky.needsUpdate = true;
  return sky;
}

/** Each finish's material, and what to free with them. */
export function finishesOf(): { finishes: Readonly<Record<Finish, Material>>; dispose: () => void } {
  const [hull, habitat, sky] = [hullMaps(11), hullMaps(23, BAND), skyOf()];
  const seen = { envMap: sky, envMapIntensity: 1 };
  const finishes: Record<Finish, MeshStandardMaterial> = {
    hull: new MeshStandardMaterial({ ...seen, ...hull, metalness: 0.3, roughness: 1 }),
    habitat: nightLit(
      new MeshStandardMaterial({ ...seen, ...habitat, metalness: 0.3, roughness: 1, emissive: 0xffffff, emissiveIntensity: GLOW }),
    ),
    dark: new MeshStandardMaterial({ ...seen, color: 0x3b3f47, metalness: 0.7, roughness: 0.45 }),
    mirror: new MeshStandardMaterial({ ...seen, color: 0xc4cfdd, metalness: 0.9, roughness: 0.2, envMapIntensity: 3 }),
    radiator: new MeshStandardMaterial({ ...seen, color: 0xe9e9e4, metalness: 0.05, roughness: 0.75, normalMap: hull.normalMap }),
    lane: new MeshStandardMaterial({ color: 0x000000, emissive: 0xbfeaff, emissiveIntensity: LANE, roughness: 1, metalness: 0 }),
    gold: new MeshStandardMaterial({ ...seen, color: 0xc8994a, metalness: 0.85, roughness: 0.32, normalMap: hull.normalMap }),
  };
  const maps = [hull.map, hull.normalMap, hull.roughnessMap, habitat.map, habitat.normalMap, habitat.roughnessMap, habitat.emissiveMap, sky];
  return {
    finishes,
    dispose: () => {
      for (const material of Object.values(finishes)) material.dispose();
      for (const map of maps) map?.dispose();
    },
  };
}

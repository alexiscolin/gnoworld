// Every world but the Earth, drawn from its look and its recipe (ADR-0002 §3): one program for them all, the recipe's surface handed as
// one struct, its palettes as the recipe gives them, its real maps as detail. A chunk of its own: the cosmos asks for it with the maps.
import { worldLook, worldRecipe, type Nature, type PlanetLook, type Recipe } from "@gnoworld/core";
import { Color, ShaderMaterial, Vector3, type BufferGeometry, type IUniform } from "three";
import { GENERATED_FRAGMENT } from "./generatedShader.ts";
import { planetFrom, type MapSet, type Planet } from "./planet.ts";
import { SURFACE_VERTEX } from "./surfaceShader.ts";
import { noLights, sharedUniforms, working } from "./uniforms.ts";

export interface World {
  readonly look: PlanetLook;
  readonly recipe: Recipe;
}

type Rgb = readonly [number, number, number];

const NO_COLOUR: Rgb = [0, 0, 0];
// The real map's warp never stretches it by more than a fifth, whatever its frequency: no streaks.
const MAX_STRETCH = 0.2;
const linear = ([red, green, blue]: Rgb) => new Color().setRGB(red, green, blue);
// A volcanic world's style (Alexis, 2026-11-03: several, each from a real reference): its seed's byte 18, read back from the minor's
// offset (core gives byte / 255 * 16). Io's sulfur crust, dark orange to pale yellow, set by eye from its description, no image sampled.
const STYLES = 3;
const SULFUR: readonly [Rgb, Rgb, Rgb] = [
  [0.42, 0.2, 0.05],
  [0.86, 0.64, 0.13],
  [0.96, 0.88, 0.4],
];

/** A volcanic world's look among three: 0 the approved dark crust with white-hot vents, 1 gold veins, 2 a sulfur crust; 0 elsewhere. */
export const styleOf = ({ look }: World): number =>
  look.anchor === "volcanic" ? Math.round((look.minorOffset[0] * 255) / 16) % STYLES : 0;

/** What a generated world's program reads: its look's and its recipe's values, and its maps. */
export function worldUniforms({ look, recipe }: World, maps: MapSet): Record<string, IUniform> {
  const [low, mid, high] = recipe.palette.linear;
  const [minorLow, minorMid, minorHigh] = recipe.minorPalette.linear;
  const sea = look.sea ?? { shallow: NO_COLOUR, deep: NO_COLOUR };
  const { warp } = look;
  return {
    ...sharedUniforms(look, maps),
    shape: { value: { ...recipe.surface } },
    minorMap: { value: maps.map(recipe.minorMap) },
    offset: { value: new Vector3(...warp.offset) },
    minorOffset: { value: new Vector3(...look.minorOffset) },
    low: { value: linear(low) },
    mid: { value: linear(mid) },
    high: { value: linear(high) },
    minorLow: { value: linear(minorLow) },
    minorMid: { value: linear(minorMid) },
    minorHigh: { value: linear(minorHigh) },
    seaShallow: { value: working(sea.shallow) },
    seaDeep: { value: working(sea.deep) },
    glowColour: { value: working(look.glow?.colour ?? NO_COLOUR) },
    glowLevel: { value: look.glow?.level ?? 0 },
    style: { value: styleOf({ look, recipe }) },
    sulfurLow: { value: working(SULFUR[0]) },
    sulfurMid: { value: working(SULFUR[1]) },
    sulfurHigh: { value: working(SULFUR[2]) },
    minorShare: { value: recipe.minorShare },
    warpAmount: { value: Math.min(warp.amount, MAX_STRETCH / warp.frequency) },
    warpFrequency: { value: warp.frequency },
    recolour: { value: look.recolour },
    banded: { value: recipe.surface.bands > 0 ? 1 : 0 },
    locked: { value: look.locked ? 1 : 0 },
    ...noLights(),
  };
}

/** A generated world, which may be moved and scaled through its group. */
export function createWorld(world: World, maps: MapSet, sphere: BufferGeometry): Planet {
  const surface = new ShaderMaterial({
    vertexShader: SURFACE_VERTEX,
    fragmentShader: GENERATED_FRAGMENT,
    uniforms: worldUniforms(world, maps),
  });
  return planetFrom(world.look, surface, { maps, sphere });
}

/** The world of an id, as the site draws it: `nature`, read once, leans its class. */
export const worldOf = (id: string, nature: Nature | null = null): World => ({
  look: worldLook(id, nature),
  recipe: worldRecipe(id, nature),
});

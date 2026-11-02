// What a world's surface program reads from its look, apart from the sun and the clock: what both programs share, then the Earth's own.
// A look is data, never shader text; every other world's own uniforms are generated.ts's.
import type { MapName, PlanetLook, WorldSigns } from "@gnoworld/core";
import { Color, Euler, Matrix3, Matrix4, SRGBColorSpace, Vector3, type IUniform, type Texture } from "three";
import { lightCode } from "./signShaders.ts";

type Rgb = readonly [number, number, number];
type Uniforms = Record<string, IUniform>;

const NO_COLOUR: Rgb = [0, 0, 0];
// The halo of the Earth's air, in its own colour lifted toward white, and how thick an air must be to draw it fully.
const HAZE_LIFT = 0.45;
const HAZE_STRENGTH = 0.9;
const FULL_AIR = 0.05;
const THINNEST_HAZE = 0.35;
const NO_RINGS = { inner: 0, outer: 0, opacity: 0 };

export interface MapSet {
  map(name: MapName): Texture;
  readonly clouds: Texture;
  readonly ring: Texture;
  /** City lights, for the one world that has them. */
  readonly night?: Texture;
  /** The one channel a generated world's lights are read from. */
  readonly lights?: Texture;
}

export const working = ([red, green, blue]: Rgb) => new Color().setRGB(red, green, blue, SRGBColorSpace);

const spinOf = ([pole, second, third]: Rgb) =>
  new Matrix3().setFromMatrix4(new Matrix4().makeRotationFromEuler(new Euler(second, pole, third, "YXZ")));

const lifted = (value: number) => value + (1 - value) * HAZE_LIFT;
const haze = (rim: PlanetLook["rim"]): Rgb =>
  rim === null ? NO_COLOUR : [lifted(rim.colour[0]), lifted(rim.colour[1]), lifted(rim.colour[2])];

/** The Earth and its Moon: drawn from their real maps as they are, the Earth's clouds over it. */
export interface HandMade extends PlanetLook {
  readonly clouds: number;
}

// What a world lacks is marked by value: one program holds every world of its kind.
const rimUniforms = (look: PlanetLook): Uniforms => ({
  air: { value: look.rim === null ? 0 : 1 },
  hazeColour: { value: working(haze(look.rim)) },
  hazeAmount: {
    value: look.rim === null ? 0 : HAZE_STRENGTH * Math.min(Math.max(look.rim.thickness / FULL_AIR, THINNEST_HAZE), 1),
  },
});

/** What both surface programs read. */
export function sharedUniforms(look: PlanetLook, maps: MapSet): Uniforms {
  const rings = look.rings ?? NO_RINGS;
  return {
    surface: { value: maps.map(look.map) },
    cloudMap: { value: maps.clouds },
    ringMap: { value: maps.ring },
    // A sampler must hold something on every world: the flag and `settled` keep it unread.
    nightMap: { value: maps.night ?? maps.lights ?? maps.clouds },
    spin: { value: spinOf(look.spin) },
    sun: { value: new Vector3(1, 0, 0) },
    faraway: { value: 0 },
    time: { value: 0 },
    cloudTime: { value: 0 },
    relief: { value: look.relief },
    ringInner: { value: rings.inner },
    ringOuter: { value: rings.outer },
    ringOpacity: { value: rings.opacity },
    ...rimUniforms(look),
  };
}

// No world starts with a light: a world at rest draws what it drew before any sign.
export const noLights = (): Uniforms => ({
  settled: { value: 0 },
  lightLevel: { value: 0 },
  lightKind: { value: 0 },
  lightGrain: { value: 0 },
  lightFine: { value: 0 },
  lightTurn: { value: 0 },
  lightOffset: { value: new Vector3() },
});

/** The Earth's and its Moon's: their real map, the Earth's clouds and its cities. */
export const handMadeUniforms = (look: HandMade, maps: MapSet): Uniforms => ({
  ...sharedUniforms(look, maps),
  cloudCover: { value: look.clouds },
  nightLights: { value: maps.night === undefined ? 0 : 1 },
});

/** Writes a number where a material holds its uniform. */
export function setUniform(uniforms: Uniforms, name: string, value: number): void {
  const uniform = uniforms[name];
  if (uniform !== undefined) uniform.value = value;
}

/** Writes a world's lights: with none, only their reach, so a world at rest keeps every uniform it was made with. */
export function setLights(
  uniforms: Uniforms,
  { extent, level, kind, grain, fine, turn, offset }: WorldSigns["lights"],
): void {
  setUniform(uniforms, "settled", extent);
  if (extent <= 0) return;
  setUniform(uniforms, "lightLevel", level);
  setUniform(uniforms, "lightKind", lightCode(kind));
  setUniform(uniforms, "lightGrain", grain);
  setUniform(uniforms, "lightFine", fine);
  setUniform(uniforms, "lightTurn", turn);
  (uniforms["lightOffset"]?.value as Vector3 | undefined)?.set(...offset);
}

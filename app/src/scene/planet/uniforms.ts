// A world's uniforms, from its look: what its surface shader reads, apart from the sun and the clock. A look is data, never shader text.
import type { MapName, PlanetLook, WorldSigns } from "@gnoworld/core";
import { Color, Euler, Matrix3, Matrix4, SRGBColorSpace, Vector3, type IUniform, type Texture } from "three";
import { lightCode } from "./signShaders.ts";

type Rgb = readonly [number, number, number];
type Uniforms = Record<string, IUniform>;

const NO_COLOUR: Rgb = [0, 0, 0];
const NO_SEA = { shallow: NO_COLOUR, deep: NO_COLOUR };
const NO_GLOW = { level: 0, colour: NO_COLOUR };
// The halo of the Earth's air, in its own colour lifted toward white, and how thick an air must be to draw it fully.
const HAZE_LIFT = 0.45;
const HAZE_STRENGTH = 0.9;
const FULL_AIR = 0.05;
const THINNEST_HAZE = 0.35;
const MAX_STRETCH = 0.2;
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

// What a world lacks is marked by value: one program holds every world.
function signUniforms(look: PlanetLook): Uniforms {
  const sea = look.sea ?? NO_SEA;
  const glow = look.glow ?? NO_GLOW;
  const rings = look.rings ?? NO_RINGS;
  return {
    air: { value: look.rim === null ? 0 : 1 },
    blueSea: { value: look.sea === null ? 0 : 1 },
    hazeColour: { value: working(haze(look.rim)) },
    hazeAmount: {
      value:
        look.rim === null ? 0 : HAZE_STRENGTH * Math.min(Math.max(look.rim.thickness / FULL_AIR, THINNEST_HAZE), 1),
    },
    seaShallow: { value: working(sea.shallow) },
    seaDeep: { value: working(sea.deep) },
    glowLevel: { value: glow.level },
    glowColour: { value: working(glow.colour) },
    ringInner: { value: rings.inner },
    ringOuter: { value: rings.outer },
    ringOpacity: { value: rings.opacity },
  };
}

// No world starts with a light: a world at rest draws what it drew before any sign.
const noLights = (): Uniforms => ({
  settled: { value: 0 },
  lightLevel: { value: 0 },
  lightKind: { value: 0 },
  lightGrain: { value: 0 },
  lightFine: { value: 0 },
  lightTurn: { value: 0 },
  lightOffset: { value: new Vector3() },
});

export function surfaceUniforms(look: PlanetLook, maps: MapSet): Uniforms {
  const [low, mid, high] = look.ramp;
  const { warp } = look;
  return {
    surface: { value: maps.map(look.map) },
    // A sampler must hold something on every world, and a map the world has anyway uploads nothing more.
    second: { value: maps.map(look.second ?? look.map) },
    cloudMap: { value: maps.clouds },
    ringMap: { value: maps.ring },
    // A sampler must hold something on every world: the flag and `settled` keep it unread.
    nightMap: { value: maps.night ?? maps.lights ?? maps.clouds },
    nightLights: { value: maps.night === undefined ? 0 : 1 },
    spin: { value: spinOf(look.spin) },
    sun: { value: new Vector3(1, 0, 0) },
    time: { value: 0 },
    cloudTime: { value: 0 },
    // The warp never stretches a map by more than a fifth, whatever its frequency: no streaks.
    warpAmount: { value: Math.min(warp.amount, MAX_STRETCH / warp.frequency) },
    warpFrequency: { value: warp.frequency },
    warpOffset: { value: new Vector3(...warp.offset) },
    secondShare: { value: look.secondShare },
    rampLow: { value: working(low) },
    rampMid: { value: working(mid) },
    rampHigh: { value: working(high) },
    recolour: { value: look.recolour },
    contrast: { value: look.contrast },
    cracks: { value: look.cracks },
    relief: { value: look.relief },
    caps: { value: look.caps },
    cloudCover: { value: look.clouds },
    rifts: { value: look.rifts },
    locked: { value: look.locked ? 1 : 0 },
    ...signUniforms(look),
    ...noLights(),
  };
}

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

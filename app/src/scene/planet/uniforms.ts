// A world's uniforms, from its look: what its surface shader reads, apart from the sun and the clock. A look is data, never shader text.
import type { MapName, PlanetLook } from "@gnoworld/core";
import { Color, Euler, Matrix3, Matrix4, SRGBColorSpace, Vector3, type IUniform, type Texture } from "three";

type Rgb = readonly [number, number, number];
type Uniforms = Record<string, IUniform>;

const NO_COLOUR: Rgb = [0, 0, 0];
const NO_SEA = { level: -1, shallow: NO_COLOUR, deep: NO_COLOUR };
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
    blueSea: { value: look.map === "earth-day" ? 1 : 0 },
    hazeColour: { value: working(haze(look.rim)) },
    hazeAmount: {
      value:
        look.rim === null ? 0 : HAZE_STRENGTH * Math.min(Math.max(look.rim.thickness / FULL_AIR, THINNEST_HAZE), 1),
    },
    seaLevel: { value: sea.level },
    seaShallow: { value: working(sea.shallow) },
    seaDeep: { value: working(sea.deep) },
    glowLevel: { value: glow.level },
    glowColour: { value: working(glow.colour) },
    ringInner: { value: rings.inner },
    ringOuter: { value: rings.outer },
    ringOpacity: { value: rings.opacity },
  };
}

export function surfaceUniforms(look: PlanetLook, maps: MapSet): Uniforms {
  const [low, mid, high] = look.ramp;
  const { warp } = look;
  return {
    surface: { value: maps.map(look.map) },
    second: { value: maps.map(look.second) },
    cloudMap: { value: maps.clouds },
    ringMap: { value: maps.ring },
    // A sampler must hold something on every world: the flag keeps it unread.
    nightMap: { value: maps.night ?? maps.clouds },
    nightLights: { value: maps.night === undefined ? 0 : 1 },
    spin: { value: spinOf(look.spin) },
    sun: { value: new Vector3(1, 0, 0) },
    time: { value: 0 },
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
    limb: { value: look.limb },
    caps: { value: look.caps },
    cloudCover: { value: look.clouds },
    rifts: { value: look.rifts },
    locked: { value: look.locked ? 1 : 0 },
    ...signUniforms(look),
  };
}

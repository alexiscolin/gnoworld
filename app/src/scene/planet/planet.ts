// One world, drawn from its look: a surface, its air if it has any, its rings if it has any. It owns its materials and the rings' mesh; the
// maps and the sphere are shared by every world and stay with their owner, the part that loads them.
import type { MapName, PlanetLook } from "@gnoworld/core";
import {
  BufferGeometry,
  Color,
  CustomBlending,
  DoubleSide,
  Euler,
  Group,
  Matrix3,
  Matrix4,
  Mesh,
  OneFactor,
  OneMinusSrcAlphaFactor,
  RingGeometry,
  ShaderMaterial,
  SRGBColorSpace,
  Vector3,
  type IUniform,
  type Texture,
} from "three";
import { Disposer } from "../disposer.ts";
import { AIR_FRAGMENT, AIR_VERTEX } from "./airShader.ts";
import { RING_FRAGMENT, RING_VERTEX } from "./ringShader.ts";
import { SURFACE_FRAGMENT, SURFACE_VERTEX } from "./surfaceShader.ts";

type Rgb = readonly [number, number, number];
type Uniforms = Record<string, IUniform>;

const RING_SEGMENTS = 256;
const RING_FLAT = -Math.PI / 2;
// Over the surface, under the rings, for a ring in front of a world sits in front of its air.
const AIR_ORDER = 1;
const RING_ORDER = 2;
const NO_COLOUR: Rgb = [0, 0, 0];
const NO_SEA = { level: -1, shallow: NO_COLOUR, deep: NO_COLOUR };
const NO_GLOW = { level: 0, colour: NO_COLOUR };
const NO_RINGS = { inner: 0, outer: 0, opacity: 0 };

export interface MapSet {
  map(name: MapName): Texture;
  readonly clouds: Texture;
  readonly ring: Texture;
}

export interface Planet {
  readonly look: PlanetLook;
  readonly group: Group;
  readonly surface: ShaderMaterial;
  /** Where its star is, as a unit vector: one light a system. */
  setSun(direction: Vector3): void;
  /** Turns the world and its clouds. The caller owns the clock. */
  setTime(seconds: number): void;
  dispose(): void;
}

const working = ([red, green, blue]: Rgb) => new Color().setRGB(red, green, blue, SRGBColorSpace);

const spinOf = ([pole, second, third]: Rgb) =>
  new Matrix3().setFromMatrix4(new Matrix4().makeRotationFromEuler(new Euler(second, pole, third, "YXZ")));

// What a world lacks is marked by value: one program holds every world.
function signUniforms(look: PlanetLook): Uniforms {
  const sea = look.sea ?? NO_SEA;
  const glow = look.glow ?? NO_GLOW;
  const rings = look.rings ?? NO_RINGS;
  return {
    air: { value: look.rim === null ? 0 : 1 },
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

function surfaceUniforms(look: PlanetLook, maps: MapSet): Uniforms {
  const [low, mid, high] = look.ramp;
  const { warp } = look;
  return {
    surface: { value: maps.map(look.map) },
    second: { value: maps.map(look.second) },
    cloudMap: { value: maps.clouds },
    ringMap: { value: maps.ring },
    spin: { value: spinOf(look.spin) },
    sun: { value: new Vector3(1, 0, 0) },
    time: { value: 0 },
    warpAmount: { value: warp.amount },
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

function airMaterial(rim: NonNullable<PlanetLook["rim"]>): ShaderMaterial {
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
    },
  });
}

function ringMaterial(rings: NonNullable<PlanetLook["rings"]>, map: Texture): ShaderMaterial {
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
    },
  });
}

class LivePlanet implements Planet {
  readonly #owner = new Disposer();
  readonly #parts: ShaderMaterial[] = [];
  readonly look: PlanetLook;
  readonly group = new Group();
  readonly surface: ShaderMaterial;

  constructor(look: PlanetLook, maps: MapSet, sphere: BufferGeometry) {
    this.look = look;
    this.group.rotation.x = look.lean;
    this.group.rotation.z = look.tilt;
    this.surface = new ShaderMaterial({
      vertexShader: SURFACE_VERTEX,
      fragmentShader: SURFACE_FRAGMENT,
      uniforms: surfaceUniforms(look, maps),
    });
    this.#add(new Mesh(sphere, this.surface));
    if (look.rim !== null) {
      const air = this.#add(new Mesh(sphere, airMaterial(look.rim)));
      air.scale.setScalar(1 + look.rim.thickness);
      air.renderOrder = AIR_ORDER;
    }
    if (look.rings !== null) this.#addRings(look.rings, maps.ring);
  }

  #add(mesh: Mesh<BufferGeometry, ShaderMaterial>): Mesh<BufferGeometry, ShaderMaterial> {
    this.group.add(mesh);
    this.#parts.push(mesh.material);
    this.#owner.add(mesh.material);
    return mesh;
  }

  #addRings(rings: NonNullable<PlanetLook["rings"]>, map: Texture): void {
    const geometry = this.#owner.add(new RingGeometry(rings.inner, rings.outer, RING_SEGMENTS, 1));
    const mesh = this.#add(new Mesh(geometry, ringMaterial(rings, map)));
    mesh.rotation.x = RING_FLAT;
    mesh.renderOrder = RING_ORDER;
  }

  setSun(direction: Vector3): void {
    for (const part of this.#parts) (part.uniforms["sun"]?.value as Vector3).copy(direction);
  }

  setTime(seconds: number): void {
    const time = this.surface.uniforms["time"];
    if (time !== undefined) time.value = seconds;
  }

  dispose(): void {
    this.#owner.dispose();
  }
}

/** A world drawn from `look`. It may be moved and scaled through its group, which stays at the look's tilt. */
export const createPlanet = (look: PlanetLook, maps: MapSet, sphere: BufferGeometry): Planet =>
  new LivePlanet(look, maps, sphere);

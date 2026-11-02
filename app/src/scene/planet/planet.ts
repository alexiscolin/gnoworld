// One world, drawn from its look: a surface, its air if it has any, its rings if it has any. It owns its materials and the rings' mesh; the
// maps and the sphere are shared by every world and stay with their owner, the part that loads them.
import type { PlanetLook, WorldSigns } from "@gnoworld/core";
import {
  AdditiveBlending,
  BufferGeometry,
  CustomBlending,
  DoubleSide,
  Group,
  Mesh,
  OneFactor,
  OneMinusSrcAlphaFactor,
  RingGeometry,
  ShaderMaterial,
  Vector3,
  type Texture,
} from "three";
import { Disposer } from "../disposer.ts";
import { AIR_FRAGMENT, AIR_VERTEX } from "./airShader.ts";
import { RING_FRAGMENT, RING_VERTEX } from "./ringShader.ts";
import { HALO_FRAGMENT, HALO_VERTEX } from "./signShaders.ts";
import { SURFACE_FRAGMENT, SURFACE_VERTEX } from "./surfaceShader.ts";
import { setLights, surfaceUniforms, working, type MapSet } from "./uniforms.ts";

export type { MapSet };

const RING_SEGMENTS = 256;
const RING_FLAT = -Math.PI / 2;
// Over the surface, under the rings, for a ring in front of a world sits in front of its air.
const AIR_ORDER = 1;
const RING_ORDER = 2;
// A seed's glow reaches this far past its small body, in front of it: frame 4's signal is a glow with a heart, not a ring round a disc.
const HALO_REACH = 2.6;
export interface Planet {
  readonly look: PlanetLook;
  readonly group: Group;
  readonly surface: ShaderMaterial;
  /** Where its star is, as a unit vector: one light a system. */
  setSun(direction: Vector3): void;
  /** Turns the ground to `seconds`, and the clouds over it to `clouds`, which the eye's own moves leave out. */
  setTime(seconds: number, clouds?: number): void;
  /** Lights the edge of its air by hand on the day side: the Earth's bright rim (frame 39), for scattering alone floods its seas first. */
  setLimb(light: number): void;
  /** Shows a world's stage. Its `size` is a factor for whoever scales the group: the view owns the group's scale. */
  setSigns(signs: WorldSigns): void;
  dispose(): void;
}

/** How hard the Earth lights the edge of its air: the bright limb of frame 39. */
export const LIMB_LIGHT = 1.05;

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
      limbLight: { value: 0 },
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

const haloMaterial = (): ShaderMaterial =>
  new ShaderMaterial({
    vertexShader: HALO_VERTEX,
    fragmentShader: HALO_FRAGMENT,
    transparent: true,
    depthWrite: false,
    blending: AdditiveBlending,
    uniforms: { signal: { value: 0 } },
  });

class LivePlanet implements Planet {
  readonly #owner = new Disposer();
  readonly #parts: ShaderMaterial[] = [];
  readonly #sphere: BufferGeometry;
  readonly #hasLights: boolean;
  #halo: Mesh<BufferGeometry, ShaderMaterial> | undefined;
  readonly look: PlanetLook;
  readonly group = new Group();
  readonly surface: ShaderMaterial;

  constructor(look: PlanetLook, maps: MapSet, sphere: BufferGeometry) {
    this.look = look;
    this.#sphere = sphere;
    this.#hasLights = maps.lights !== undefined;
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
    for (let at = 0; at < this.#parts.length; at += 1)
      (this.#parts[at]?.uniforms["sun"]?.value as Vector3).copy(direction);
  }

  setTime(seconds: number, clouds = seconds): void {
    const time = this.surface.uniforms["time"];
    if (time !== undefined) time.value = seconds;
    const drift = this.surface.uniforms["cloudTime"];
    if (drift !== undefined) drift.value = clouds;
  }

  setLimb(light: number): void {
    for (const { uniforms } of this.#parts)
      if (uniforms["limbLight"] !== undefined) uniforms["limbLight"].value = light;
  }

  setSigns({ lights, signal }: WorldSigns): void {
    if (this.#hasLights) setLights(this.surface.uniforms, lights);
    if (signal <= 0 && this.#halo === undefined) return;
    const halo = (this.#halo ??= this.#addHalo());
    halo.visible = signal > 0;
    const glow = halo.material.uniforms["signal"];
    if (glow !== undefined) glow.value = signal;
  }

  // Made for the worlds that need one: a world at rest keeps the meshes the lab drew. No sun reaches it, so it stays out of `#parts`.
  #addHalo(): Mesh<BufferGeometry, ShaderMaterial> {
    const halo = new Mesh(this.#sphere, this.#owner.add(haloMaterial()));
    halo.scale.setScalar(HALO_REACH);
    this.group.add(halo);
    return halo;
  }

  dispose(): void {
    this.#owner.dispose();
  }
}

/** A world drawn from `look`. It may be moved and scaled through its group, which stays at the look's tilt. */
export const createPlanet = (look: PlanetLook, maps: MapSet, sphere: BufferGeometry): Planet =>
  new LivePlanet(look, maps, sphere);

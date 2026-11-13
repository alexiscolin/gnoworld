// One world: a surface, its air if it has any, its rings if it has any. The Earth and its Moon draw their real maps (`createPlanet`), every
// other world its recipe (generated.ts). It owns its materials and the rings' mesh; the maps and the sphere are shared by every world and
// stay with their owner, the part that loads them.
import { smoothstep, type PlanetLook, type WorldSigns } from "@gnoworld/core";
import {
  BufferGeometry,
  Group,
  Mesh,
  PlaneGeometry,
  RingGeometry,
  ShaderMaterial,
  Vector3,
  Vector4,
  type Texture,
} from "three";
import { Disposer } from "../disposer.ts";
import { glowMaterial } from "./glowMaterial.ts";
import type { PlateMask } from "./plateMask.ts";
import { airMaterial, haloMaterial, ringMaterial } from "./planetMaterials.ts";
import { SURFACE_FRAGMENT, SURFACE_VERTEX } from "./surfaceShader.ts";
import { handMadeUniforms, setLights, setUniform, type HandMade, type MapSet } from "./uniforms.ts";

export type { HandMade, MapSet };

const RING_SEGMENTS = 256;
const RING_FLAT = -Math.PI / 2;
// Over the surface, under the rings, for a ring in front of a world sits in front of its air.
const AIR_ORDER = 1;
const RING_ORDER = 2;
const HALO_ORDER = 3;
// A seed's glow reaches this far past its small body, in front of it: frame 4's signal is a glow with a heart, not a ring round a disc.
const HALO_REACH = 2.6;
// Vector4's own default is w = 1, a moon of radius 1: none is radius 0.
/** How long the real height takes to come in, in milliseconds. */
const HEIGHT_MS = 600;
// A page's close framing comes and goes over this long: the air's lit limb fades with the move, never at once.
const CLOSE_MS = 700;
const NO_SHADOW = new Vector4(0, 0, 0, 0);

export interface Planet {
  readonly look: PlanetLook;
  readonly group: Group;
  readonly surface: ShaderMaterial;
  /** Where its star is, as a unit vector: one light a system. */
  setSun(direction: Vector3): void;
  /** Turns the ground to `seconds`, and the clouds over it to `clouds`, which the eye's own moves leave out; `still` holds the extras
   * that ride the clouds' clock (a lava world's glow) still, as reduced motion asks. */
  setTime(seconds: number, clouds?: number, still?: boolean): void;
  /** Gives the Earth or the Moon its real height, once it came: its relief, its sea, its shadows. Any other world ignores it. */
  setHeight(map: Texture): void;
  /** Where its moons stand, each as world x, y, z and its radius: their shadows cross it (D13900). At most four; the rest, none. */
  setMoons(shadows: readonly Vector4[]): void;
  /** Swaps the Earth's day, night and cloud maps for others of the same pictures at another size. */
  setEarthMaps(maps: { day: Texture; night: Texture; clouds: Texture }): void;
  /** How far it has come in, 0 to 1: its surface, air and rings fade in together; below 1 its surface blends over what is behind. */
  setArrive(share: number): void;
  /** Whether the relief's shadows and cavities are drawn: off under the Low setting. */
  setDepth(on: boolean): void;
  /** Lights the edge of its air by hand on the day side: the Earth's bright rim (frame 39), for scattering alone floods its seas first. */
  setLimb(light: number): void;
  /** How dim it stands, 0 to 1: a world a lens leaves unlit (D502). */
  setFar(share: number): void;
  /** How much a page that frames it close pushes its air's lit limb, 0 to 1 (D458). */
  setClose(share: number): void;
  /** Keeps its glare off the page's plate: the stage's plate uniforms (D490). */
  setPlate(mask: PlateMask): void;
  /** Shows a world's stage. Its `size` is a factor for whoever scales the group: the view owns the group's scale. */
  setSigns(signs: WorldSigns): void;
  dispose(): void;
}

interface Parts {
  readonly maps: MapSet;
  readonly sphere: BufferGeometry;
}

/** How hard the Earth lights the edge of its air: the bright limb of frame 39. */
export const LIMB_LIGHT = 1.05;

class LivePlanet implements Planet {
  readonly #owner = new Disposer();
  readonly #parts: ShaderMaterial[] = [];
  readonly #sphere: BufferGeometry;
  readonly #hasLights: boolean;
  #heightAt = 0;
  // How far its close framing has come, 0 to 1, and when it was last stepped: it eases over CLOSE_MS, the rim never drops or shows whole.
  #close = -1;
  #closeAt = 0;
  #halo: Mesh<BufferGeometry, ShaderMaterial> | undefined;
  #glow: Mesh<BufferGeometry, ShaderMaterial> | undefined;
  readonly look: PlanetLook;
  readonly group = new Group();
  readonly surface: ShaderMaterial;

  constructor(look: PlanetLook, surface: ShaderMaterial, { maps, sphere }: Parts) {
    this.look = look;
    this.#sphere = sphere;
    this.#hasLights = maps.lights !== undefined;
    this.group.rotation.x = look.lean;
    this.group.rotation.z = look.tilt;
    this.surface = surface;
    this.#add(new Mesh(sphere, this.surface));
    if (look.rim !== null) {
      const air = this.#add(new Mesh(sphere, airMaterial(look.rim, look.glow)));
      air.scale.setScalar(1 + look.rim.thickness);
      air.renderOrder = AIR_ORDER;
      this.#glow = this.#add(new Mesh(this.#owner.add(new PlaneGeometry(2, 2)), glowMaterial(look.rim)));
      this.#glow.renderOrder = AIR_ORDER;
      this.#glow.visible = this.#glow.frustumCulled = false;
    }
    if (look.rings !== null) this.#addRings(look, look.rings, maps.ring);
  }

  #add(mesh: Mesh<BufferGeometry, ShaderMaterial>): Mesh<BufferGeometry, ShaderMaterial> {
    this.group.add(mesh);
    this.#parts.push(mesh.material);
    this.#owner.add(mesh.material);
    return mesh;
  }

  #addRings(look: PlanetLook, rings: NonNullable<PlanetLook["rings"]>, map: Texture): void {
    const geometry = this.#owner.add(new RingGeometry(rings.inner, rings.outer, RING_SEGMENTS, 1));
    const mesh = this.#add(new Mesh(geometry, ringMaterial(look, rings, map)));
    mesh.rotation.x = RING_FLAT;
    mesh.renderOrder = RING_ORDER;
  }

  setSun(direction: Vector3): void {
    for (const part of this.#parts) (part.uniforms["sun"]?.value as Vector3).copy(direction);
  }

  setTime(seconds: number, clouds = seconds, still = false): void {
    const time = this.surface.uniforms["time"];
    if (time !== undefined) time.value = seconds;
    const drift = this.surface.uniforms["cloudTime"];
    if (drift !== undefined) drift.value = clouds;
    const life = this.surface.uniforms["life"];
    if (life !== undefined) life.value = still ? 0 : 1;
    for (const { uniforms } of this.#parts) setUniform(uniforms, "ringTime", clouds);
  }

  setHeight(map: Texture): void {
    const { uniforms } = this.surface;
    if (uniforms["heightMap"] === undefined) return;
    if (uniforms["heightMap"].value !== map) {
      uniforms["heightMap"].value = map;
      this.#heightAt = performance.now();
    }
    // Its relief, sea and shadows come in over a moment, never in one frame.
    setUniform(uniforms, "heightOn", smoothstep(0, HEIGHT_MS, performance.now() - this.#heightAt));
  }

  setEarthMaps({ day, night, clouds }: { day: Texture; night: Texture; clouds: Texture }): void {
    const { uniforms } = this.surface;
    for (const [name, map] of [
      ["surface", day],
      ["nightMap", night],
      ["cloudMap", clouds],
    ] as const)
      if (uniforms[name] !== undefined) uniforms[name].value = map;
  }

  setArrive(share: number): void {
    for (const { uniforms } of this.#parts) setUniform(uniforms, "arrive", share);
    this.surface.transparent = share < 1;
  }

  setDepth(on: boolean): void {
    const depth = this.surface.uniforms["depth"];
    if (depth !== undefined && depth.value !== Number(on)) depth.value = Number(on);
  }

  setMoons(shadows: readonly Vector4[]): void {
    const held = this.surface.uniforms["moonShadows"]?.value as Vector4[] | undefined;
    held?.forEach((slot, at) => slot.copy(shadows[at] ?? NO_SHADOW));
  }

  setLimb(light: number): void {
    for (const { uniforms } of this.#parts)
      if (uniforms["limbLight"] !== undefined) uniforms["limbLight"].value = light;
  }

  setFar(share: number): void {
    for (const { uniforms } of this.#parts) if (uniforms["faraway"] !== undefined) uniforms["faraway"].value = share;
  }

  setClose(share: number): void {
    const now = performance.now();
    // The first call stands where it is asked (the planet's own arrival fades it in); later ones walk to it at 1 / CLOSE_MS a millisecond.
    const step = (now - this.#closeAt) / CLOSE_MS;
    this.#close = this.#close < 0 ? share : this.#close + Math.max(-step, Math.min(step, share - this.#close));
    this.#closeAt = now;
    const eased = smoothstep(0, 1, this.#close);
    for (const { uniforms } of this.#parts) setUniform(uniforms, "close", eased);
    if (this.#glow !== undefined) this.#glow.visible = eased > 0;
  }

  setPlate(mask: PlateMask): void {
    if (this.#glow !== undefined) Object.assign(this.#glow.material.uniforms, mask);
  }

  setSigns({ lights, signal }: WorldSigns): void {
    if (this.#hasLights) setLights(this.surface.uniforms, lights);
    if (signal <= 0 && this.#halo === undefined) return;
    const halo = (this.#halo ??= this.#addHalo());
    halo.visible = signal > 0;
    setUniform(halo.material.uniforms, "signal", signal);
  }

  // Made for the worlds that need one: a world at rest keeps the meshes the lab drew. No sun reaches it, so it stays out of `#parts`.
  #addHalo(): Mesh<BufferGeometry, ShaderMaterial> {
    const halo = new Mesh(this.#sphere, this.#owner.add(haloMaterial()));
    halo.scale.setScalar(HALO_REACH);
    halo.renderOrder = HALO_ORDER;
    this.group.add(halo);
    return halo;
  }

  dispose(): void {
    this.#owner.dispose();
  }
}

/** A world of `look` on its own surface's material, which it then owns, with its air and rings. */
export const planetFrom = (look: PlanetLook, surface: ShaderMaterial, parts: Parts): Planet =>
  new LivePlanet(look, surface, parts);

/** The Earth or its Moon, from its real map. It may be moved and scaled through its group, which stays at the look's tilt. */
export const createPlanet = (look: HandMade, maps: MapSet, sphere: BufferGeometry): Planet =>
  planetFrom(
    look,
    new ShaderMaterial({
      vertexShader: SURFACE_VERTEX,
      fragmentShader: SURFACE_FRAGMENT,
      uniforms: handMadeUniforms(look, maps),
    }),
    { maps, sphere },
  );

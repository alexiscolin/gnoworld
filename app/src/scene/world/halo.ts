// A world's light seen close (ADR-0002 §10, "a bright rim and a soft halo"; 7e's design review, 4 and 6): a soft halo on its limb, brightest
// where its star lights it, and the star's own haze far behind it on that side, warm and low, never blinding. Both are planes facing the eye.
import type { PlanetLook } from "@gnoworld/core";
import { Mesh, PlaneGeometry, Vector2, type ShaderMaterial, type Vector3 } from "three";
import type { Disposer } from "../disposer.ts";
import { added } from "../earth/orbit.ts";
import { GLOW_VERTEX } from "../earth/orbitShader.ts";
import { working } from "../planet/uniforms.ts";
import { HALO_REACH, LIMB_HALO_FRAGMENT, STAR_HAZE_FRAGMENT } from "./shaders.ts";

// An airless world's limb takes the star's own warm white.
const AIRLESS_RIM = [1, 0.93, 0.84] as const;
const HAZE_SIZE = 3.4;
const HAZE_REACH = 2.4;
const HAZE_DEPTH = -6;

export class WorldHalo {
  readonly #lit = { value: new Vector2(1, 0) };
  readonly #haze: Mesh<PlaneGeometry, ShaderMaterial>;
  readonly meshes: readonly Mesh[];

  constructor(owner: Disposer, look: PlanetLook) {
    const rim = look.rim === null ? AIRLESS_RIM : look.rim.colour;
    const halo = new Mesh(
      owner.add(new PlaneGeometry(2 * HALO_REACH, 2 * HALO_REACH)),
      owner.add(added(GLOW_VERTEX, LIMB_HALO_FRAGMENT, { litSide: this.#lit, rimColour: { value: working(rim) } })),
    );
    halo.position.z = -0.5;
    this.#haze = new Mesh(
      owner.add(new PlaneGeometry(2, 2)),
      owner.add(added(GLOW_VERTEX, STAR_HAZE_FRAGMENT, { litSide: this.#lit })),
    );
    this.#haze.scale.setScalar(HAZE_SIZE);
    this.meshes = [halo, this.#haze];
  }

  /** Where the star stands as the eye sees it, a unit vector in the world's own frame. */
  setSide(sun: Vector3): void {
    this.#lit.value.set(sun.x, sun.y).normalize();
    this.#haze.position.set(this.#lit.value.x * HAZE_REACH, this.#lit.value.y * HAZE_REACH, HAZE_DEPTH);
  }
}

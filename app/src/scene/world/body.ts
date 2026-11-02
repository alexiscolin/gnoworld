// A world seen close, as one group: its approved render, one overlay that adds its signs and the shadows cast on it, the status ring with its
// moon, and the wake. It owns all of it but the maps, which its view loads and frees, and the sphere, which it is lent.
import type { PlanetLook, StatusOrbit, WorldSigns } from "@gnoworld/core";
import {
  CustomBlending,
  Group,
  Mesh,
  OneFactor,
  OneMinusSrcAlphaFactor,
  PlaneGeometry,
  ShaderMaterial,
  TorusGeometry,
  Vector3,
  Vector4,
  type BufferGeometry,
  type Quaternion,
} from "three";
import { Disposer } from "../disposer.ts";
import { Ground } from "../earth/ground.ts";
import { added, ORBIT_ROLL, ORBIT_TILT, ORBIT_RADIUS } from "../earth/orbit.ts";
import { GLOW_FRAGMENT, GLOW_VERTEX, ORBIT_VERTEX } from "../earth/orbitShader.ts";
import { createPlanet, LIMB_LIGHT, type MapSet, type Planet } from "../planet/planet.ts";
import { WorldHalo } from "./halo.ts";
import { OCCLUDERS_MAX, OVERLAY_FRAGMENT, OVERLAY_VERTEX, STATUS_FRAGMENT, WAKE_FRAGMENT } from "./shaders.ts";

const OVER_GROUND = 1.004;
// Off the orbit: no threshold's mark, where the realm states none.
const NO_MARK = -1;
const TUBE = 0.012;
const RING_MOON = 0.06;
const WAKE_REACH = 3.4;
const FORWARD = new Vector3(0, 0, RING_MOON);
const REST: WorldSigns = {
  stage: "rest",
  size: 1,
  signal: 0,
  lights: { extent: 0, level: 0, kind: "towns", grain: 1, fine: 1, offset: [0, 0, 0], turn: 0 },
};
// Over the air (order 1), under the rings: the overlay; the orbit, the moon's halo and the wake over all.
const OVERLAY_ORDER = 1.5;
const TOP_ORDER = 4;

/** A storm's place on the ground, a unit vector, from the seed's byte `at`: away from the poles, where the aurora is. */
function stormPlace(seed: Uint8Array, at: number): Vector3 {
  const turn = ((seed[at] ?? 0) / 255) * Math.PI * 2;
  const height = ((seed[at + 1] ?? 0) / 255 - 0.5) * 1.1;
  return new Vector3(Math.cos(turn), height, Math.sin(turn)).normalize();
}

/** What a world's body is made of: its look and seed, its maps and its ring moon's, and the sphere it is lent. */
export interface BodyParts {
  readonly look: PlanetLook;
  readonly seed: Uint8Array;
  readonly maps: { readonly world: MapSet; readonly moon: MapSet; readonly moonLook: PlanetLook };
  readonly sphere: BufferGeometry;
}

export class WorldBody {
  readonly #owner = new Disposer();
  readonly planet: Planet;
  readonly overlay: ShaderMaterial;
  readonly group = new Group();
  /** The world, its overlay and its orbit, at the world's size: the view scales it. */
  readonly sized = new Group();
  readonly orbit = new Group();
  readonly ringMoon: Planet;
  /** The plate painted again in the circle it opens for the world, as the Earth's. */
  readonly ground = this.#owner.add(new Ground());
  readonly #tube: Mesh<TorusGeometry, ShaderMaterial>;
  readonly #moonGlow: Mesh<PlaneGeometry, ShaderMaterial>;
  readonly #halo: WorldHalo;
  readonly #wake: Mesh<PlaneGeometry, ShaderMaterial>;

  constructor({ look, seed, maps, sphere }: BodyParts) {
    this.planet = this.#owner.add(createPlanet(look, maps.world, sphere));
    // A seed's glow is made now, hidden, so it compiles with the world and nothing is made on the wake's first frame.
    this.planet.setSigns({ ...REST, signal: 1 });
    this.planet.setSigns(REST);
    if (look.rim !== null) this.planet.setLimb(LIMB_LIGHT);
    this.overlay = this.#owner.add(
      new ShaderMaterial({
        vertexShader: OVERLAY_VERTEX,
        fragmentShader: OVERLAY_FRAGMENT,
        transparent: true,
        depthWrite: false,
        blending: CustomBlending,
        blendSrc: OneFactor,
        blendDst: OneMinusSrcAlphaFactor,
        uniforms: {
          sun: { value: new Vector3(1, 0, 0) },
          time: { value: 0 },
          aurora: { value: 0 },
          storms: { value: new Vector3() },
          stormAt: { value: [0, 2, 4].map((at) => stormPlace(seed, 9 + at)) },
          heat: { value: 0 },
          occluders: { value: Array.from({ length: OCCLUDERS_MAX }, () => new Vector4()) },
          occluderCount: { value: 0 },
        },
      }),
    );
    const over = new Mesh(sphere, this.overlay);
    over.scale.setScalar(OVER_GROUND);
    over.renderOrder = OVERLAY_ORDER;
    this.planet.group.add(over);
    this.#tube = this.#top(
      new Mesh(
        this.#owner.add(new TorusGeometry(ORBIT_RADIUS, TUBE, 12, 360).rotateX(Math.PI / 2)),
        this.#owner.add(
          added(ORBIT_VERTEX, STATUS_FRAGMENT, {
            litTo: { value: Math.PI },
            against: { value: 0 },
            mark: { value: NO_MARK },
          }),
        ),
      ),
    );
    this.ringMoon = this.#owner.add(createPlanet(maps.moonLook, maps.moon, sphere));
    this.ringMoon.group.scale.setScalar(RING_MOON);
    this.#moonGlow = this.#top(
      new Mesh(this.#owner.add(new PlaneGeometry(0.4, 0.4)), this.#owner.add(added(GLOW_VERTEX, GLOW_FRAGMENT, {}))),
    );
    this.orbit.rotation.set(ORBIT_TILT, 0, ORBIT_ROLL, "ZXY");
    this.orbit.add(this.#tube, this.ringMoon.group);
    this.orbit.visible = false;
    this.#moonGlow.visible = false;
    this.#wake = this.#top(
      new Mesh(
        this.#owner.add(new PlaneGeometry(2, 2)),
        this.#owner.add(added(GLOW_VERTEX, WAKE_FRAGMENT, { wave: { value: 0 } })),
      ),
    );
    this.#wake.scale.setScalar(WAKE_REACH);
    this.#wake.visible = false;
    this.sized.add(this.planet.group, this.orbit, this.#moonGlow);
    this.#halo = new WorldHalo(this.#owner, look);
    this.sized.add(...this.#halo.meshes);
    this.group.add(this.ground.mesh, this.sized, this.#wake);
  }

  #top<T extends Mesh>(mesh: T): T {
    mesh.renderOrder = TOP_ORDER;
    return mesh;
  }

  /** The one sun, a unit vector in the world's own frame, for its halo; then, turned by the eye's `turn`, for the world, its overlay and the
   * ring's moon. */
  setSun(sun: Vector3, turn: Quaternion): void {
    this.#halo.setSide(sun);
    sun.applyQuaternion(turn);
    this.planet.setSun(sun);
    this.ringMoon.setSun(sun);
    (this.overlay.uniforms["sun"]?.value as Vector3).copy(sun);
  }

  setTime(seconds: number): void {
    this.planet.setTime(seconds);
    const time = this.overlay.uniforms["time"];
    if (time !== undefined) time.value = seconds;
  }

  setSigns(
    signs: WorldSigns,
    { aurora, storms, heat }: { aurora: number; storms: readonly number[]; heat: number },
  ): void {
    this.planet.setSigns(signs);
    const { uniforms } = this.overlay;
    if (uniforms["aurora"] !== undefined) uniforms["aurora"].value = aurora;
    if (uniforms["heat"] !== undefined) uniforms["heat"].value = heat;
    (uniforms["storms"]?.value as Vector3).set(storms[0] ?? 0, storms[1] ?? 0, storms[2] ?? 0);
  }

  /** The ring for `orbit`, or none. The moon stands at its angle, in the orbit's own frame. */
  setRing(orbit: StatusOrbit | undefined): void {
    this.orbit.visible = orbit !== undefined;
    this.#moonGlow.visible = orbit !== undefined;
    if (orbit === undefined) return;
    const { uniforms } = this.#tube.material;
    if (uniforms["litTo"] !== undefined) uniforms["litTo"].value = orbit.moon;
    if (uniforms["against"] !== undefined) uniforms["against"].value = orbit.against ?? 0;
    if (uniforms["mark"] !== undefined) uniforms["mark"].value = orbit.mark ?? NO_MARK;
    const at = new Vector3(Math.cos(orbit.moon), 0, Math.sin(orbit.moon)).multiplyScalar(ORBIT_RADIUS);
    this.ringMoon.group.position.copy(at);
    // The halo faces the eye, so it stands outside the orbit's lean, in front of the moon.
    this.#moonGlow.position.copy(at).applyEuler(this.orbit.rotation).add(FORWARD);
  }

  /** The bodies that cast on the world, each a centre in the stage's frame and a radius: its moons, and the ring's when it shows. */
  setCasters(moons: readonly Vector4[], ring: Vector4 | undefined): number {
    const { uniforms } = this.overlay;
    const slots = uniforms["occluders"]?.value as Vector4[];
    let count = 0;
    for (let at = 0; at < moons.length && count < OCCLUDERS_MAX; at += 1) {
      const moon = moons[at];
      if (moon !== undefined) slots[count]?.copy(moon);
      count += 1;
    }
    if (ring !== undefined && count < OCCLUDERS_MAX) {
      slots[count]?.copy(ring);
      count += 1;
    }
    if (uniforms["occluderCount"] !== undefined) uniforms["occluderCount"].value = count;
    return count;
  }

  /** The wake at `left`, 1 as it starts and 0 once gone. */
  setWake(left: number): void {
    this.#wake.visible = left > 0;
    const wave = this.#wake.material.uniforms["wave"];
    if (wave !== undefined) wave.value = left;
  }

  dispose(): void {
    this.group.removeFromParent();
    this.#owner.dispose();
  }
}

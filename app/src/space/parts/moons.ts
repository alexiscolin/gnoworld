// The moons round a planet a page frames close (D490, ADR-0002 §3 "Rooms as moons"): the world's busiest rooms, four at most (the Earth one),
// each a rocky world of the product's own look (moonLook.ts), the size of its room's activity on a log scale, flaring when it speaks. The
// first stands on the orbit the page draws, near the camera and in front of the planet, for depth; the others stand farther out, leaning.
// A frame moves their angles alone, held under reduced motion. No room, no moon.
import { EARTH } from "@gnoworld/core";
import {
  Group,
  LineSegments,
  Quaternion,
  SphereGeometry,
  Vector3,
  Vector4,
  type PerspectiveCamera,
  type Scene,
  type WebGLRenderer,
} from "three";
import { MOONS_MOST } from "../planet/surfaceParts.ts";
import { placeOf, type Planet, type Vec } from "../layout.ts";
import type { Maps } from "./maps.ts";
import { mapsOf } from "./mapsOf.ts";
import { moonOf } from "./moonLook.ts";
import { angleOf, EARTH_ROOM, emptySlot, LEANS, ORBITS, showOf, sizeOf, type Slot } from "./moonSlot.ts";

/** A room that has a moon: its id, its messages a minute, and whether the page is in it (the first, then). */
export interface MoonRoom {
  readonly room: string;
  readonly rate: number;
}

const EASE_S = 0.7;
const FLARE_S = 5;

const X = new Vector3(1, 0, 0);

export class Moons {
  readonly group = new Group();
  readonly #slots: Slot[] = Array.from({ length: MOONS_MOST }, emptySlot);
  /** Each moon's world x, y, z and radius, for the planet's eclipses; a radius of 0 is no moon (Planet.setMoons). */
  readonly shadows: readonly Vector4[] = Array.from({ length: MOONS_MOST }, () => new Vector4(0, 0, 0, 0));
  readonly #sphere = new SphereGeometry(1, 64, 48);
  readonly #at: Vec = { x: 0, y: 0, z: 0 };
  readonly #sun = new Vector3();
  readonly #to = new Vector3();
  readonly #turn = new Quaternion();
  readonly #maps: Maps;
  readonly #lines: LineSegments[];
  readonly #lean = new Quaternion();
  readonly #eye = new Vector3();
  #device: { renderer: WebGLRenderer; camera: PerspectiveCamera; scene: Scene } | undefined;
  #wanted: readonly MoonRoom[] = [];
  #dirty = false;
  #of: Planet | undefined;
  #seconds = 0;
  #spin = 0;

  /** `ring`: the page's orbit line, whose look each other moon's orbit line takes (D490). */
  constructor(maps: Maps, ring: LineSegments) {
    this.#lines = this.#slots.map(() => new LineSegments(ring.geometry, ring.material));
    this.group.add(...this.#lines.slice(1));
    for (const line of this.#lines) line.visible = false;
    this.#maps = maps;
    this.group.visible = false;
  }

  /** The renderer, to compile a moon's program before it shows. */
  use(device: { renderer: WebGLRenderer; camera: PerspectiveCamera; scene: Scene }): void {
    this.#device = device;
  }

  /** The rooms that have a moon now, the page's first; the ones it had and lost fade out. */
  rooms(wanted: readonly MoonRoom[]): void {
    this.#wanted = wanted;
    this.#dirty = true;
  }

  /** Round `planet`, `seconds` on, in the plane `turn` leans the page's ring to, seen from `eye`; none, they go. */
  follow(
    planet: Planet | undefined,
    clock: { seconds: number; delta: number; still: boolean },
    view: { turn: Quaternion; eye: Vector3 },
  ): void {
    const { delta } = clock;
    this.#seconds = clock.seconds;
    const gone = planet === undefined;
    if (gone) {
      // The planet is left (a flight begins): the moons go at once and are made again as one is framed.
      [this.#of, this.#dirty] = [undefined, true];
      for (const slot of this.#slots) slot.alpha = 0;
    } else if (planet !== this.#of) this.#arrive(planet, view);
    if (this.#dirty && !gone) this.#sync(planet.id === EARTH ? 1 : MOONS_MOST, clock.still);
    const ease = clock.still ? 1 : 1 - Math.exp(-delta / EASE_S);
    this.group.visible = false;
    for (const shadow of this.shadows) shadow.w = 0;
    if (planet !== undefined) placeOf(planet, clock.seconds, this.#at);
    this.#slots.forEach((slot, at) => {
      this.#tick(slot, { ease, delta, shown: !gone && !slot.leaving && slot.room !== "" });
      if (!slot.ready && this.#lines[at] !== undefined) this.#lines[at].visible = false;
      if (planet !== undefined && slot.ready) this.#place(slot, at, { planet, clock, view });
    });
  }

  // The planet changed: the foreground moon starts on the ring's near side, a little to one side, as the eye sees it.
  #arrive(planet: Planet, { turn, eye }: { turn: Quaternion; eye: Vector3 }): void {
    this.#of = planet;
    placeOf(planet, this.#seconds, this.#at);
    const local = this.#to
      .set(eye.x - this.#at.x, eye.y - this.#at.y, eye.z - this.#at.z)
      .applyQuaternion(this.#turn.copy(turn).invert());
    this.#spin = Math.atan2(local.z, local.x) - 0.7;
  }

  // The rooms wanted onto the slots: a room keeps its slot, one that left fades out, a new one takes a free slot.
  #sync(cap: number, still: boolean): void {
    this.#dirty = false;
    const wanted = this.#wanted.slice(0, cap);
    for (const slot of this.#slots) slot.leaving = slot.room !== "" && !wanted.some(({ room }) => room === slot.room);
    for (const { room, rate } of wanted) {
      const held = this.#slots.find((slot) => slot.room === room);
      const slot = held ?? this.#slots.find((each) => each.room === "");
      if (slot === undefined) continue;
      if (held === undefined) slot.room = room;
      if (rate > slot.rate + 0.5 && !still) slot.flare = 1;
      [slot.rate, slot.leaving] = [rate, false];
    }
  }

  // A slot's moon made when it has a room and the maps came, shown once compiled and uploaded, eased in and out, freed once gone.
  #tick(slot: Slot, { ease, delta, shown }: { ease: number; delta: number; shown: boolean }): void {
    if (slot.drawn === undefined && slot.room !== "" && !slot.leaving) this.#make(slot);
    slot.alpha += ((shown && slot.ready ? 1 : 0) - slot.alpha) * ease;
    slot.flare *= Math.exp(-delta / FLARE_S);
    if (slot.alpha < 0.01 && !shown && slot.drawn !== undefined && slot.room !== "") this.#free(slot);
  }

  #make(slot: Slot): void {
    const drawn = moonOf(slot.room, { maps: this.#maps, sphere: this.#sphere });
    const device = this.#device;
    if (drawn === undefined || device === undefined) return;
    slot.drawn = drawn;
    this.group.add(drawn.group);
    const uploads = mapsOf(drawn.group);
    for (const map of uploads) device.renderer.initTexture(map);
    device.renderer.compileAsync(drawn.group, device.camera, device.scene).then(
      () => {
        slot.ready = true;
      },
      () => undefined,
    );
  }

  #free(slot: Slot): void {
    if (slot.drawn !== undefined) {
      this.group.remove(slot.drawn.group);
      slot.drawn.dispose();
    }
    Object.assign(slot, emptySlot());
  }

  // A moon in view lends its planet a shadow: where it stands and how large.
  #cast(at: number, { group }: { group: Group }): void {
    if (group.visible) this.shadows[at]?.set(group.position.x, group.position.y, group.position.z, group.scale.x);
  }

  #place(
    slot: Slot,
    at: number,
    {
      planet,
      clock,
      view,
    }: {
      planet: Planet;
      clock: { seconds: number; delta: number; still: boolean };
      view: { turn: Quaternion; eye: Vector3 };
    },
  ): void {
    const { drawn } = slot;
    if (drawn === undefined) return;
    const angle = angleOf(at, this.#spin, clock);
    const radius = (ORBITS[at] ?? 2) * planet.radius;
    const lean = LEANS[at] ?? 0;
    this.#to
      .set(Math.cos(angle), Math.sin(angle) * Math.sin(lean), Math.sin(angle) * Math.cos(lean))
      .multiplyScalar(radius);
    this.#orbitLine(at, { planet, turn: view.turn }, slot.alpha);
    this.#to.applyQuaternion(view.turn);
    drawn.group.position.set(this.#at.x + this.#to.x, this.#at.y + this.#to.y, this.#at.z + this.#to.z);
    // A moon grows into its place as its light comes (D517), never popping whole.
    drawn.group.scale.setScalar(sizeOf(slot.rate) * planet.radius * (1 + 0.1 * slot.flare) * (0.6 + 0.4 * slot.alpha));
    const shown = slot.alpha * this.#clear(planet, view.eye, sizeOf(slot.rate) * planet.radius);
    const { place } = planet.system;
    drawn.setSun(this.#lit(place, view.eye, drawn.group.position));
    drawn.setTime(clock.still ? 0 : clock.seconds);
    this.#maps.dress(drawn, slot.room === EARTH_ROOM ? "moon" : undefined, this.#device?.renderer);
    const { uniforms } = drawn.surface;
    if (uniforms["moonAlpha"] !== undefined) uniforms["moonAlpha"].value = shown;
    if (uniforms["moonFlare"] !== undefined) uniforms["moonFlare"].value = slot.flare;
    drawn.group.visible = shown > 0.01;
    this.#cast(at, drawn);
    if (drawn.group.visible) this.group.visible = true;
  }

  // How much of the moon shows, `this.#to` its place round the planet: none as it goes behind the limb (showOf).
  #clear(planet: Planet, eye: Vector3, size: number): number {
    const toEye = this.#eye.set(eye.x - this.#at.x, eye.y - this.#at.y, eye.z - this.#at.z).normalize();
    const depth = this.#to.dot(toEye);
    return showOf(depth, Math.sqrt(Math.max(this.#to.lengthSq() - depth * depth, 0)), { radius: planet.radius, size });
  }

  // The moon's light: its sun's side as the eye sees it, turned toward the eye, so a moon before a planet that hides its sun is never a black disc.
  #lit(sun: Vec, eye: Vector3, at: Vector3): Vector3 {
    const toEye = this.#eye.copy(eye).sub(at).normalize();
    const light = this.#sun.set(sun.x - at.x, sun.y - at.y, sun.z - at.z).normalize();
    return light.addScaledVector(toEye, -light.dot(toEye)).normalize().addScaledVector(toEye, 0.55).normalize();
  }

  // The line of moon `at`'s orbit, faint as the page's own: the same circle, leaned as the moon is (the first rides the page's).
  #orbitLine(at: number, { planet, turn }: { planet: Planet; turn: Quaternion }, alpha: number): void {
    const line = this.#lines[at];
    if (line === undefined || at === 0) return;
    line.visible = alpha > 0.01;
    line.position.set(this.#at.x, this.#at.y, this.#at.z);
    line.scale.setScalar((ORBITS[at] ?? 2) * planet.radius);
    line.quaternion.copy(turn).multiply(this.#lean.setFromAxisAngle(X, -(LEANS[at] ?? 0)));
  }

  dispose(): void {
    for (const slot of this.#slots) slot.drawn?.dispose();
    this.#sphere.dispose();
  }
}

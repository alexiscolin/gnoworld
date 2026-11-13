// The planets near enough to be seen as themselves (D401): the few largest on screen, once a few pixels across, are drawn as the
// generated planets they are (the Earth as the hand-made one), at the same place and size, lit by their sun; their quad is hidden
// meanwhile. A planet stands only once its maps came, went to the GPU one a frame, and its shaders compiled, so it never waits on screen
// and never stalls the frame it comes in.
import { Euler, Quaternion, Vector3, type Vector4 } from "three";
import { EARTH } from "@gnoworld/core";
import { scaleOf } from "../boosts.ts";
import { placeOf, type Planet, type Universe, type Vec } from "../layout.ts";
import type { Planet as Drawn } from "../planet/planet.ts";
import { fall, handOver, ready, step } from "./arrival.ts";
import { dayOf } from "../earth/light.ts";
import { drawnOf } from "./draw.ts";
import { adopt, SPHERE } from "./adopt.ts";
import { holdOf, type Held } from "./held.ts";
import { Bones } from "./bones.ts";
import { upgradeStep } from "./upgrade.ts";
import { warmFrame } from "./warmup.ts";
import { Warm } from "./warm.ts";
import { sight } from "./wanted.ts";
import type { NearDevice } from "./nearDevice.ts";

// At most this many planets are kept made, more than the ones drawn.
const KEPT = 24;

export class Near {
  readonly #device: NearDevice;
  readonly #bones = new Bones();
  /** The maps asked ahead of their being seen as themselves (warm.ts). */
  readonly warm: Warm;
  readonly #held = new Map<number, Held>();
  readonly #at: Vec = { x: 0, y: 0, z: 0 };
  readonly #sun = new Vector3();
  // The planets drawn as themselves, largest first, and how many pixels across each is.
  readonly #wanted: Planet[] = [];
  readonly #sizes: number[] = [];
  // The open system's planets too small yet, made ahead: each shows whole the frame it is wanted.
  readonly #ahead: Planet[] = [];
  #wantedIndex = new Set<number>();
  // The planets whose quad is hidden for their skeleton: each gets it back once it is wanted no more and stands not as itself.
  readonly #hidden = new Set<number>();
  // The planets drawn as themselves once: none goes back to its skeleton in this page's life, whatever made it anew meanwhile (a planet
  // forgotten, a page's alone), only to its quad.
  readonly #drawnOnce = new Set<number>();

  // The frame's time, the page's planet and the one it frames close (-1 none), for the callbacks a frame runs.
  #seconds = 0;
  #alone = -1;
  // How far the page has come over the sun (0 where the sun is drawn, 1 on a page): the Earth's sun is the star's till then (D13002).
  #page = 0;
  #lit: ReadonlySet<string> | undefined;
  #close = -1;
  #shadowed = -1;
  // Whether a map went to the GPU this frame: the Earth's full maps wait for a frame that sent none.
  #sent = false;
  // The frame's delta, and whether motion is reduced: a planet then comes in at once.
  #fade = { delta: 0, still: true };

  /** Whether a planet is still coming in from its skeleton: the scene must go on drawing, or the fade stops where it stands. */
  arriving = false;

  /** The worlds a lens lights, by their ids: the others stay quads, which dim (D425); none, every one may be drawn as itself. */
  only: ReadonlySet<string> | undefined;
  // Each world's ground turned past its own spin, in seconds of it, so a bubble stands clear of the dock (D488, D565): kept when its page
  // goes, so the world keeps the angle it has on screen and turns on at its own pace, never unwound or reset.
  // Each world's lean toward the eye too (D13916), laid over its look's own lean and tilt.
  readonly #led = new Map<string, { ahead: number; leaned: Quaternion }>();
  // What a Near keeps for its planets, lent to the next (adopt.ts).
  readonly #kept = { held: this.#held, hidden: this.#hidden, once: this.#drawnOnce, led: this.#led };
  readonly #look = new Quaternion();
  readonly #euler = new Euler();

  /** `from`: the Near of the universe `before`, whose planets this one adopts into `now` (matched by id), as they stand. */
  constructor(device: NearDevice, from?: { near: Near; before: Universe; now: Universe }) {
    this.#device = device;
    this.warm = new Warm(device.maps);
    device.stage.add(this.#bones.group);
    if (from !== undefined) adopt(from.near.#kept, this.#kept, { ...from, planets: device.planets });
  }

  /** Turns the ground of the world `id` on `seconds` past its own spin; its clouds keep time. */
  lead(id: string, seconds: number, leaned: Quaternion): void {
    const led = this.#led.get(id);
    if (led === undefined) this.#led.set(id, { ahead: seconds, leaned: new Quaternion().copy(leaned) });
    else [led.ahead, led.leaned] = [seconds, led.leaned.copy(leaned)];
  }

  /** Chooses which planets are drawn as themselves, from `eye`, `pxK` world units a pixel at distance 1, a few times a second; with
   * `open`, only that system's (-1: none; the others' are asked ahead, never drawn). */
  choose(universe: Universe, eye: Vec, { pxK, seconds, open }: { pxK: number; seconds: number; open?: number }): void {
    const lists = { wanted: this.#wanted, sizes: this.#sizes, ahead: this.#ahead, warm: this.warm };
    sight(universe, { eye, pxK, seconds, open }, lists);
    // More made ahead than are kept would be dropped and remade each choose.
    this.#ahead.length = Math.min(this.#ahead.length, KEPT - this.#wanted.length);
    this.#wantedIndex = new Set(this.#wanted.map(({ index }) => index));
    for (const planet of [...this.#wanted, ...this.#ahead]) this.#make(planet);
    this.#forget();
  }

  /** A frame `seconds` on: the planets drawn as themselves stand where their quads would; with `alone` (a page's planet's index),
   * that one alone; `close`, the planet a page frames close, its air's lit limb pushed (D458). */
  tick(
    seconds: number,
    view: {
      alone: number;
      close: Planet | undefined;
      delta: number;
      still: boolean;
      page?: number;
    },
  ): void {
    this.#fade = view;
    this.#page = view.page ?? this.#page;
    this.#seconds = seconds;
    this.#alone = view.alone;
    this.#close = view.close?.index ?? -1;
    this.#sent = this.#wanted.some(this.#uploadOne) || this.#ahead.some(this.#uploadOne);
    for (const held of this.#held.values()) warmFrame(held, this.#device.camera);
    this.#held.forEach(this.#showOne);
    this.#held.forEach(this.#leaveOne);
    this.#bones.begin();
    this.arriving = false;
    this.#wanted.forEach(this.#placeOne);
    this.#bones.end();
    for (const index of this.#hidden)
      if (!this.#wantedIndex.has(index)) {
        this.#hidden.delete(index);
        this.#device.planets.show(index, this.#held.get(index)?.shown !== true);
      }
  }

  /** Makes every planet shown whole at once, its skeleton gone: a scene nobody sees stops its clock, and would go on half drawn once seen. */
  settle(): void {
    for (const held of this.#held.values()) if (held.shown) [held.arrive, held.fresh] = [1, false];
    this.#bones.clear();
  }

  /** Where the moons of `planet`, framed close, stand: their shadows cross it; the planet before is cleared. */
  eclipse(planet: Planet | undefined, shadows: readonly Vector4[]): void {
    const index = planet?.index ?? -1;
    if (this.#shadowed !== index) this.#held.get(this.#shadowed)?.drawn.setMoons([]);
    this.#shadowed = index;
    this.#held.get(index)?.drawn.setMoons(shadows);
  }

  /** Whether planet `index` stands as itself (its maps on the GPU), not as its quad. */
  shows(index: number): boolean {
    return this.#held.get(index)?.shown === true;
  }

  // Planet `index` shown as itself or as its quad: made once, called on frames.
  readonly #showOne = (held: Held, index: number): void => {
    const [compiled, uploads, wanted] = [held.compiled, held.uploads.length, this.#wantedIndex.has(index)];
    const shown = ready({ compiled, uploads, wanted, alone: this.#alone, index });
    if (shown === held.shown) return;
    held.shown = shown;
    handOver(held, this.#fade.still);
    held.over = shown && !this.#hidden.has(index);
    this.#device.planets.show(index, !shown || held.over);
  };

  // A planet that leaves stays placed as it fades, its air and close framing with it, else it keeps its last size beside its quad.
  readonly #leaveOne = (held: Held): void => {
    if (!held.leaving) return;
    this.#place(held.planet, held.drawn, this.#seconds);
    fall(held, this.#fade);
  };

  // A wanted planet stands where its quad would, as itself once ready, coming in from its skeleton; until then its skeleton stands
  // alone, never a degraded look.
  readonly #placeOne = (planet: Planet): void => {
    const held = this.#held.get(planet.index);
    if (held?.shown === true) {
      this.#drawnOnce.add(planet.index);
      this.#place(planet, held.drawn, this.#seconds);
      if (planet.id === EARTH && !this.#sent) upgradeStep(held, this.#device.maps, this.#device.renderer);
      const share = step(held, this.#fade);
      held.drawn.setArrive(share);
      this.#coming(planet, held, share);
    } else if (this.#alone < 0 || this.#alone === planet.index) {
      if (this.#drawnOnce.has(planet.index)) return;
      this.#device.planets.show(planet.index, false);
      this.#hidden.add(planet.index);
      this.#skeleton(planet, 1);
    }
  };

  // A planet coming in stands in its skeleton, or, if it comes over its quad, over that, which goes once it is whole.
  #coming(planet: Planet, held: Held, share: number): void {
    this.arriving ||= held.over && share < 1;
    if (held.over && share >= 1) this.#device.planets.show(planet.index, (held.over = false));
    else if (!held.over && share < 1) this.#skeleton(planet, 1 - share);
  }

  #skeleton(planet: Planet, opacity: number): void {
    this.arriving ||= opacity < 1;
    const at = placeOf(planet, this.#seconds, this.#at);
    this.#bones.show(planet, { at, seconds: this.#seconds, opacity, ...this.#led.get(planet.id) });
  }

  // One map a frame goes to the GPU, the planets wanted first: true once one went.
  readonly #uploadOne = (planet: Planet): boolean => {
    const map = this.#held.get(planet.index)?.uploads.pop();
    if (map === undefined) return false;
    this.#device.renderer.initTexture(map);
    return true;
  };

  #place(planet: Planet, drawn: Drawn, seconds: number): void {
    placeOf(planet, seconds, this.#at);
    drawn.group.position.set(this.#at.x, this.#at.y, this.#at.z);
    // As large as its quad (shaders/planets.ts): a home world drawn larger shrinks with it, never at once (D548).
    drawn.group.scale.setScalar(planet.radius * scaleOf(planet.index));
    const { place } = planet.system;
    drawn.setSun(this.#sun.set(place.x - this.#at.x, place.y - this.#at.y, place.z - this.#at.z).normalize());
    const led = this.#led.get(planet.id);
    const time = seconds + (led?.ahead ?? 0);
    const { lean, tilt } = drawn.look;
    const leaned = led?.leaned;
    if (leaned !== undefined)
      drawn.group.quaternion.copy(leaned).multiply(this.#look.setFromEuler(this.#euler.set(lean, 0, tilt)));
    drawn.setTime(
      dayOf(drawn, { id: planet.id, epochMs: Date.now(), time, page: this.#page }, this.#sun),
      seconds,
      this.#fade.still,
    );
    // A world a lens leaves unlit stays itself, darkened as the lens comes, never a flat quad (D502); the last lens's while it goes.
    if (this.only !== undefined) this.#lit = this.only;
    drawn.setFar(this.#lit?.has(planet.id) === false ? this.#device.lens.value : 0);
    drawn.setClose(planet.index === this.#close ? 1 : 0);
    this.#device.maps.dress(drawn, planet.id === EARTH ? "earth" : undefined, this.#device.renderer);
  }

  #make(planet: Planet): void {
    if (this.#held.has(planet.index)) return;
    // With a page's planet shown, the other worlds' maps wait for the page's own (Maps).
    const page = this.#alone < 0 || this.#alone === planet.index;
    const made = drawnOf(planet, this.#device.maps, { sphere: SPHERE, page });
    if (made === undefined) return;
    this.#held.set(planet.index, holdOf(made, planet, this.#device));
  }

  // Past the kept number, the planets not wanted go, least recently made first.
  #forget(): void {
    for (const [index, held] of this.#held) {
      if (this.#held.size <= KEPT) return;
      if (this.#wantedIndex.has(index)) continue;
      this.#drop(index, held);
    }
  }

  readonly #drop = (index: number, held: Held): void => {
    this.#device.stage.remove(held.drawn.group);
    held.drawn.dispose();
    this.#device.planets.show(index, true);
    this.#held.delete(index);
  };

  dispose(): void {
    for (const [index, held] of this.#held) this.#drop(index, held);
    this.#device.stage.remove(this.#bones.group);
    this.#bones.dispose();
  }
}

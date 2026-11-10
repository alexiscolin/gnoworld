// The names over the universe (D401, the demo's pills): far out the systems worth a name from where the eye stands, the planets of the system the camera is in
// once it is large enough to tell them apart (all of them from above, the Map, D433), and no other system's then, which would pile up
// behind it; none on a page seen as it turns, where the Map names the page's world first. A fixed pool of buttons, moved by transform only; a click enters.
import { systemName } from "../placeName.ts";
import { isAddress } from "@gnoworld/core";
import { placeOf, type Planet, type System, type Universe, type Vec } from "./layout.ts";
import type { Seen } from "./see.ts";
import { assign, retire, type Slot } from "./labelSlots.ts";
import { fillPill, midOf, tagOf, type LabelHooks } from "./midWorlds.ts";
import styles from "./labels.module.css";

const POOL = 36;
// Far out, the heaviest few always named, and any other once its orbits span this many pixels (D455).
const ALWAYS = 6;
// Inside a system, the few other systems named beside its planets, the heaviest in sight: a way out to them, drawn apart (D460).
const OTHERS = 3;
// raw: a system's orbits this wide on screen, where its name stops crowding the heavier ones'
const NAMED_FROM_PX = 14;
// A system's planets are named once it is this many pixels across.
const PLANETS_FROM_PX = 140;
// raw: a name's room on screen, a short name's pill: a name that would stand within it of a livelier one gives way
const ROOM = { x: 110, y: 24 };
const NONE: readonly Item[] = [];

type Item = Planet | System;
const isPlanet = (item: Item): item is Planet => "system" in item;

/** A label's words: a world's name, or a system's (placeName.ts's systemName), its address on hover (the label's title). */
export const labelOf = (item: Item, name: (id: string) => string): string =>
  isPlanet(item) ? name(item.id) : systemName(item, name);

export class Labels {
  readonly #slots: Slot<Item, HTMLButtonElement>[] = [];
  readonly #held = new Map<Item, Slot<Item, HTMLButtonElement>>();
  readonly #ofButton = new WeakMap<Element, Slot<Item, HTMLButtonElement>>();
  readonly #at: Vec = { x: 0, y: 0, z: 0 };
  readonly #on: Vec = { x: 0, y: 0, z: 0 };
  readonly #items: Item[] = [];
  // Where the frame's names stand on screen, x then y.
  readonly #taken = new Float32Array(POOL * 2);
  readonly #byUse = new WeakMap<System, readonly Planet[]>();
  readonly #named: (item: Item) => string;
  readonly #fact: LabelHooks["fact"];
  #first: { readonly marked: Planet; readonly of: readonly Planet[]; readonly list: readonly Planet[] } | undefined;
  // Far out, each system that may be named, its rank and weight once, its score each frame; and the frame's choice.
  #far: { readonly item: System; readonly rank: number; readonly weight: number; score: number }[] = [];
  readonly #farItems: System[] = [];
  readonly #inside: Item[] = [];
  #all: readonly System[] = [];
  // What a lens lights (D425): the worlds by their ids, how many each system holds, and each system's lit planets by use.
  #only: ReadonlySet<string> | undefined;
  readonly #litIn = new Map<System, number>();
  readonly #litPlanets = new Map<System, readonly Planet[]>();
  #seen: Seen | undefined;
  #seconds = 0;
  /** The system the camera is in, whose planets it names when near. */
  system: System | undefined;
  /** Whether no name shows: on a page seen as it turns. */
  hidden = false;
  /** Whether the home's first screen shows: only its mid-distance worlds are named, once the flight has landed. */
  arrival = false;
  /** Whether space is seen from above (the Map): every planet of the system in view is named, whatever its size on screen. */
  plan = false;
  /** The page's world, named first so that its name is never the one left out. */
  marked: Planet | undefined;

  /** In `layer`; `enter` is told what a label leads to, `name` names it. */
  constructor(layer: HTMLElement, { enter, name, fact }: LabelHooks) {
    this.#named = name;
    this.#fact = fact;
    for (let at = 0; at < POOL; at += 1) {
      const button = document.createElement("button");
      button.type = "button";
      button.className = `nowrap row-center pill-ends ${styles["pill"] ?? ""}`;
      button.tabIndex = -1;
      fillPill(button);
      const slot: Slot<Item, HTMLButtonElement> = { button, item: undefined, seen: 0, retired: false };
      button.addEventListener("click", () => {
        if (slot.item !== undefined) enter(slot.item);
      });
      layer.append(button);
      this.#slots.push(slot);
      this.#ofButton.set(button, slot);
    }
  }

  /** What the name `target` stands in names, none where it is no name. */
  itemAt(target: EventTarget | null | undefined): Item | undefined {
    const button = target instanceof Element ? target.closest("button") : null;
    return button === null ? undefined : this.#ofButton.get(button)?.item;
  }

  /** The universe whose names it shows, by `names` (a world's or a namespace's) and who is here. */
  universe(universe: Universe): void {
    this.#all = universe.systems;
    this.light(this.#only);
  }

  /** Names what a lens lights alone, a system with how many of its worlds it lights, the most first; none, the liveliest of all. */
  light(only: ReadonlySet<string> | undefined): void {
    this.#only = only;
    this.#litIn.clear();
    this.#litPlanets.clear();
    if (only !== undefined)
      for (const system of this.#all) {
        const lit = system.planets.filter((planet) => only.has(planet.id)).length;
        if (lit > 0) this.#litIn.set(system, lit);
      }
    const pool = only === undefined ? [...this.#all] : [...this.#litIn.keys()];
    const lit = (system: System) => this.#litIn.get(system) ?? 0;
    const weight = (system: System) => (lit(system) > 0 ? lit(system) * 10 : system.planets.length + system.use + 1);
    this.#far = pool
      .sort((a, b) => lit(b) - lit(a) || weight(b) - weight(a))
      .map((item, rank) => ({ item, rank, weight: weight(item), score: 0 }));
    // Each name is said anew, with its count or without: the old ones fade out where they stand, the new ones fade in in other slots.
    retire(this.#slots);
  }

  /** A frame `seconds` on: the names of what `seen` shows. */
  tick(seen: Seen, seconds: number): void {
    this.#seen = seen;
    this.#seconds = seconds;
    const items = this.#items;
    items.length = 0;
    const candidates =
      this.arrival && !this.hidden ? midOf(seen, { at: this.#at, seconds, out: this.#inside }) : this.#candidates(seen);
    for (let at = 0; at < candidates.length && items.length < POOL; at += 1) {
      const item = candidates[at];
      if (item !== undefined && this.#free(item, items.length)) items.push(item);
    }
    this.#assign(items);
  }

  #assign(items: readonly Item[]): void {
    const held = assign({ slots: this.#slots, byItem: this.#held, name: this.#name }, items);
    for (const slot of this.#slots) this.#show(slot, held(slot));
  }

  // What may be named, the liveliest first: in a system its planets alone, once it is large enough to tell them apart (the universe's
  // names come back out of it); far out the liveliest systems; on a page nothing.
  #candidates(seen: Seen): readonly Item[] {
    const { system } = this;
    if (this.hidden) return NONE;
    if (system === undefined) return this.#farOut(seen);
    if (!this.plan && seen.pixels(system.place, 2 * system.reach) <= PLANETS_FROM_PX) return NONE;
    // Its planets first, then the heaviest few other systems in sight: switching is a click away, the rest are their suns alone.
    const inside = this.#inside;
    inside.length = 0;
    inside.push(...this.#marking(this.#planets(system)));
    let others = 0;
    for (const other of this.#farOut(seen))
      if (other !== system && others < OTHERS) {
        inside.push(other);
        others += 1;
      }
    return inside;
  }

  // `planets` with the page's world first, made once for each world and system.
  #marking(planets: readonly Planet[]): readonly Planet[] {
    const { marked } = this;
    if (marked === undefined) return planets;
    if (this.#first?.marked !== marked || this.#first.of !== planets)
      this.#first = { marked, of: planets, list: [marked, ...planets.filter((planet) => planet !== marked)] };
    return this.#first.list;
  }

  #planets(system: System): readonly Planet[] {
    const only = this.#only;
    if (only !== undefined) {
      const lit = this.#litPlanets.get(system) ?? this.#byUseOf(system).filter((planet) => only.has(planet.id));
      this.#litPlanets.set(system, lit);
      return lit;
    }
    return this.#byUseOf(system);
  }

  #byUseOf(system: System): readonly Planet[] {
    let sorted = this.#byUse.get(system);
    if (sorted === undefined) {
      sorted = [...system.planets].sort((a, b) => b.use - a.use);
      this.#byUse.set(system, sorted);
    }
    return sorted;
  }

  // Far out, by weight and the room its orbits take on screen (Alexis, 2026-11-09: "en fonction de là où on se situe et du zoom"): a heavy
  // system far off and a light one near both earn a name as the view comes close; the heaviest few always, the faint never.
  #farOut(seen: Seen): readonly Item[] {
    for (const each of this.#far) {
      const px = seen.pixels(each.item.place, 2 * each.item.reach);
      each.score = each.rank < ALWAYS || px >= NAMED_FROM_PX ? each.weight * px : -1;
    }
    this.#far.sort((a, b) => b.score - a.score);
    const items = this.#farItems;
    items.length = 0;
    for (const { item, score } of this.#far) if (score >= 0) items.push(item);
    return items;
  }

  // Whether `item` stands on screen clear of the `count` names already taken this frame; where it does, it is taken.
  #free(item: Item, count: number): boolean {
    const at = this.#where(item);
    if (at === undefined || this.#seen?.project(at, this.#on) !== true) return false;
    const [x, y, taken] = [this.#on.x, this.#on.y, this.#taken];
    for (let next = 0; next < count; next += 1)
      if (Math.abs((taken[next * 2] ?? x) - x) < ROOM.x && Math.abs((taken[next * 2 + 1] ?? y) - y) < ROOM.y)
        return false;
    taken[count * 2] = x;
    taken[count * 2 + 1] = y;
    return true;
  }

  // Where `item` stands now, none for none.
  #where(item: Item | undefined): Vec | undefined {
    if (item === undefined) return undefined;
    return isPlanet(item) ? placeOf(item, this.#seconds, this.#at) : item.place;
  }

  // `live`: the slot's name is still chosen or held; else it fades out where it stands (moving with its world while that is on screen).
  #show(slot: Slot<Item, HTMLButtonElement>, live: boolean): void {
    const { item } = slot;
    const at = this.#where(item);
    const on = at !== undefined && this.#seen?.project(at, this.#on) === true;
    slot.button.classList.toggle(styles["on"] ?? "", live && on);
    if (!on || item === undefined) return;
    // Another system named from inside one: another pill's look, so it reads as elsewhere, not as one of these planets.
    slot.button.classList.toggle(
      styles["other"] ?? "",
      !isPlanet(item) && this.system !== undefined && item !== this.system,
    );
    tagOf(slot.button, { seen: this.#seen, at, item, on: this.#on, arrival: this.arrival, fact: this.#fact });
  }

  // Writes `item`'s name into `slot`, its name alone (one number per fact: a system's worlds are its card's), once per item.
  readonly #name = (slot: Slot<Item, HTMLButtonElement>, item: Item): void => {
    slot.item = item;
    const name = slot.button.firstElementChild;
    const lit = isPlanet(item) ? undefined : this.#litIn.get(item);
    if (name !== null)
      name.textContent = lit === undefined ? this.#named(item) : `${this.#named(item)} · ${String(lit)}`;
    // A system named by its worlds keeps its address on hover.
    slot.button.title = !isPlanet(item) && isAddress(item.id) ? item.id : "";
    slot.button.dataset["kind"] = isPlanet(item) ? "planet" : "system";
    slot.button.classList.toggle(styles["under"] ?? "", this.arrival);
  };

  dispose(): void {
    for (const { button } of this.#slots) button.remove();
  }
}

export type { Item };

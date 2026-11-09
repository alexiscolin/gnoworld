// The rail's worlds (7i): the asks core orders, read from the worlds' file and what is known of them now, each with the
// page it links to. The order changes at most once a minute, and never while the reader is on the rail (ADR-0002 §1's rail).
import { chooseRail, daysSince, EARTH, type RailAsk, type RailWorld } from "@gnoworld/core";
import { createStore } from "zustand/vanilla";
import type { CosmosWorld } from "./space/cosmosWorld.ts";
import { pagesOf, type WorldPlaces } from "./lib/hubWorld.ts";
import { nameOf } from "./placeName.ts";
import { signalsOf, type WorldSignals } from "./features/universe/signals.ts";

/** The worlds and what is known of them now, once both are: what the rail reads. */
export interface Known {
  readonly worlds: readonly CosmosWorld[];
  readonly signals: WorldSignals;
  /** No word from the server yet: what the rail shows till it comes holds no minute. */
  readonly unheard?: true;
}

/** The least time between two orders of the rail. */
const RAIL_MINUTE = 60_000;

/** Where the rail's links go, the places the labels' doors lead to too; and the worlds the reader follows, by their ids, the last followed
 * first, which come after the Earth (slice 8). */
export type RailPlaces = WorldPlaces & { readonly followed?: readonly string[] | undefined };

export interface RailEntry extends RailWorld {
  readonly href: string;
}

function asksOf(worlds: readonly CosmosWorld[], signals: WorldSignals, pages: ReadonlyMap<string, string>): RailAsk[] {
  const asks: RailAsk[] = [{ id: EARTH, kind: "earth", signals: signalsOf(undefined, EARTH, signals) }];
  const listed = new Map(worlds.map((world) => [world.id, world]));
  for (const id of pages.keys()) {
    const world = listed.get(id);
    if (id === EARTH) continue;
    const [name, days] = [signals.names.get(id), daysSince(world?.seen, signals.now)];
    asks.push({
      id,
      kind: "far",
      signals: signalsOf(world, id, signals),
      ...(name === undefined ? {} : { name }),
      ...(days === null ? {} : { days }),
    });
  }
  return asks;
}

/** The rail's entries from the worlds and what is known of them; `shown`, the ids it shows now, holds their order; the worlds followed
 * come first. */
function railOf({ worlds, signals }: Known, places: RailPlaces, shown: readonly string[] = []): RailEntry[] {
  const pages = pagesOf(worlds, places);
  return chooseRail(asksOf(worlds, signals, pages), shown, places.followed).flatMap((world) => {
    const href = pages.get(world.id);
    return href === undefined ? [] : [{ ...world, href }];
  });
}

/** The rail of the worlds `kept` keeps alone, a tag's (D425) or a system's (D428): the liveliest first as the rail orders them, then the
 * quiet ones its sections leave out: all of them its own. At once. */
export function keptRail(known: Known, places: RailPlaces, kept: (id: string) => boolean): RailEntry[] {
  const worlds = known.worlds.filter(({ id }) => kept(id));
  const lively = railOf({ ...known, worlds }, places).filter(({ id }) => kept(id));
  const taken = new Set(lively.map(({ id }) => id));
  const quiet = [...pagesOf(worlds, places)].flatMap(([id, href]): RailEntry[] =>
    taken.has(id) || !kept(id) ? [] : [{ id, title: nameOf(id), section: "trend", href }],
  );
  // ponytail: every one, the column scrolling and each planet drawn as it shows (worldThumbs.ts); a cap if a namespace of thousands comes.
  return [...lively, ...quiet];
}

const sameEntries = (a: readonly RailEntry[], b: readonly RailEntry[]) =>
  a.length === b.length &&
  a.every((entry, at) => {
    const other = b[at];
    return (
      other?.id === entry.id &&
      other.title === entry.title &&
      other.href === entry.href &&
      other.section === entry.section
    );
  });

/** The rail's entries as shown: the first at once, and the first from the server's answer, then at most one change a minute, none while the
 * reader is on the rail. */
export class RailOrder {
  readonly #places: RailPlaces;
  readonly #shown = createStore<readonly RailEntry[]>(() => []);
  #latest: Known | undefined;
  #known: Known | undefined;
  #followed: readonly string[] = [];
  #held = false;
  #changed = Number.NEGATIVE_INFINITY;
  #timer: ReturnType<typeof setTimeout> | undefined;

  constructor(places: RailPlaces) {
    this.#places = places;
  }

  readonly subscribe = this.#shown.subscribe;

  readonly entries = this.#shown.getState;

  /** The worlds and what is known of them now: shown when the rail may change. */
  read(known: Known): void {
    this.#latest = known;
    this.#known = known;
    this.#apply();
  }

  /** The worlds the reader follows, the last followed first: a change shows at once, as the reader made it, unless they are on the rail. */
  follow(followed: readonly string[]): void {
    if (followed.join() === this.#followed.join()) return;
    this.#followed = followed;
    this.#latest ??= this.#known;
    this.#changed = Number.NEGATIVE_INFINITY;
    this.#apply();
  }

  /** Whether the reader is on the rail: its order holds till they leave. */
  hold(held: boolean): void {
    this.#held = held;
    this.#apply();
  }

  readonly #due = (): void => {
    this.#timer = undefined;
    this.#apply();
  };

  #apply(): void {
    if (this.#held || this.#latest === undefined) return;
    const wait = this.#changed + RAIL_MINUTE - Date.now();
    if (wait > 0) {
      this.#timer ??= setTimeout(this.#due, wait);
      return;
    }
    const shown = this.#shown.getState();
    const { unheard } = this.#latest;
    const next = railOf(
      this.#latest,
      { ...this.#places, followed: this.#followed },
      shown.map(({ id }) => id),
    );
    this.#latest = undefined;
    if (sameEntries(next, shown)) return;
    this.#changed = unheard === true ? Number.NEGATIVE_INFINITY : Date.now();
    this.#shown.setState(next, true);
  }

  dispose(): void {
    clearTimeout(this.#timer);
    this.#timer = undefined;
  }
}

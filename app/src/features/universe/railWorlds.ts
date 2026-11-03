// The rail's worlds (7i): the asks core orders, read from the worlds' file and what is known of them now as the labels read it, each with the
// page it links to. The order changes at most once a minute, and never while the reader is on the rail (ADR-0002 §1's rail).
import { chooseRail, daysSince, REALM_PREFIX, type RailAsk, type RailWorld } from "@gnoworld/core";
import { createStore } from "zustand/vanilla";
import { hubWorldOf } from "../../lib/hubWorld.ts";
import type { CosmosWorld, LabelSignals } from "../../scene/cosmos/cosmosWorld.ts";
import { signalsOf } from "../../scene/cosmos/labelAsks.ts";
import type { Known } from "./worldsFeed.ts";

/** The least time between two orders of the rail. */
export const RAIL_MINUTE = 60_000;

/** Where the rail's links go: the Earth's page, and the hubs the page lists, by their worlds. */
export interface RailPlaces {
  readonly earth: string;
  readonly worlds: readonly {
    readonly slug: string;
    readonly path: string;
    readonly realms?: readonly string[] | undefined;
  }[];
}

export interface RailEntry extends RailWorld {
  readonly href: string;
}

const EARTH = "earth";

// A world's page: its hub's, else its first realm's view; none for a world with neither. The Earth's is set last: a realm deployed under
// the namespace earth is a world of that id, and never takes the Earth's link.
function pagesOf(worlds: readonly CosmosWorld[], { earth, worlds: hubs }: RailPlaces): Map<string, string> {
  const pages = new Map<string, string>();
  for (const world of worlds) {
    const realm = world.realms[0]?.path;
    if (realm !== undefined) pages.set(world.id, `/r/${realm.slice(REALM_PREFIX.length)}`);
  }
  for (const hub of hubs) pages.set(hubWorldOf(hub), hub.path);
  pages.set(EARTH, earth);
  return pages;
}

function asksOf(worlds: readonly CosmosWorld[], signals: LabelSignals, pages: ReadonlyMap<string, string>): RailAsk[] {
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

/** The rail's entries from the worlds and what is known of them; `shown`, the ids it shows now, holds their order. */
export function railOf({ worlds, signals }: Known, places: RailPlaces, shown: readonly string[] = []): RailEntry[] {
  const pages = pagesOf(worlds, places);
  return chooseRail(asksOf(worlds, signals, pages), shown).flatMap((world) => {
    const href = pages.get(world.id);
    return href === undefined ? [] : [{ ...world, href }];
  });
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
      this.#places,
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

// The rail's worlds (7i): the asks core orders, read from the worlds' file and what is known of them now as the labels read it, each with the
// page it links to. The order changes at most once a minute, and never while the reader is on the rail (ADR-0002 §1's rail).
import { chooseRail, daysSince, EARTH, type RailAsk, type RailWorld } from "@gnoworld/core";
import { createStore } from "zustand/vanilla";
import type { CosmosWorld, LabelSignals } from "../../scene/cosmos/cosmosWorld.ts";
import { signalsOf } from "../../scene/cosmos/labelAsks.ts";
import { pagesOf, type WorldPlaces } from "../../lib/hubWorld.ts";
import type { Known } from "./worldsFeed.ts";

/** The least time between two orders of the rail. */
export const RAIL_MINUTE = 60_000;

/** Where the rail's links go, the places the labels' doors lead to too. */
export type RailPlaces = WorldPlaces;

export interface RailEntry extends RailWorld {
  readonly href: string;
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

// What the GUI reads of where space is (D401): how many worlds the system the camera rests at holds (none at home or far out). The door
// to space writes it; the home's hero and rail read it, the system itself from the page's address.
import { EARTH } from "@gnoworld/core";
import { useSyncExternalStore } from "react";
import { useParams } from "react-router";
import { HOME_NAMESPACES, isHome } from "../../cosmosAt.ts";
import { Heard } from "../../lib/heard.ts";

interface Where {
  readonly system: string | undefined;
  readonly worlds: number;
}

const FIRST: Where = { system: undefined, worlds: 0 };

class Views {
  #where = FIRST;
  readonly #heard = new Heard();
  readonly subscribe = this.#heard.subscribe;

  readonly where = (): Where => this.#where;

  /** Writes where space is. */
  set(change: Partial<Where>): void {
    this.#where = { ...this.#where, ...change };
    this.#heard.tell();
  }
}

export const views = new Views();
/** The system the page shows, from its address (/s/<namespace>): none far out or at home. Known at the page's first render, before space
 * says where it rests, so nothing shows the last place's words for a frame. */
export const useResting = (): string | undefined => useParams()["system"];
/** Whether the world `id` is one of `system`'s: a system is a namespace, its worlds' ids its own (layout.ts); the Earth's (D401, D501) holds
 * the Earth and the worlds of every namespace that orbits it. */
export const inSystem = (id: string, system: string): boolean =>
  isHome(system)
    ? id === EARTH || HOME_NAMESPACES.some((name) => id.startsWith(`${name}/`))
    : id.startsWith(`${system}/`);

/** How many worlds space's `system` holds, once space has laid it out there; none till then. */
export const useRestingWorlds = (system: string | undefined): number | undefined =>
  useSyncExternalStore(
    views.subscribe,
    () => (views.where().system === system ? views.where().worlds : undefined),
    () => undefined,
  );

// Where a phone starts: the chat of the last world (or the Earth) it opened in this universe, else the Earth's. A realm merely passed
// through is no start: a phone opens into a place that has a planet and a crowd.
import { fullChatHref } from "./fullChat.ts";
import type { UniverseView } from "./places.ts";

interface Places {
  earth: Pick<UniverseView["earth"], "path">;
  worlds: readonly { path: string }[];
}

const WORLD_OR_EARTH = /^(?:\/net\/[^/]+)?\/(?:earth|w\/[^/]+)\/?$/;

/** Whether `path` is a world's or the Earth's: what a phone remembers as where it was. */
export const remembers = (path: string): boolean => WORLD_OR_EARTH.test(path);

/** The full chat a phone opens in `universe`: the newest of `recents` that is one of its worlds or its Earth, else its Earth's. */
export function phoneLanding(universe: Places, recents: readonly string[]): string {
  const known = new Set([universe.earth.path, ...universe.worlds.map(({ path }) => path)]);
  const last = recents.find((path) => known.has(path));
  return fullChatHref(last ?? universe.earth.path);
}

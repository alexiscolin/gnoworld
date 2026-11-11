// The chat's recent searches on the device (slice 13, C): the last few words typed, newest first, in one key of the page's storage.
// What the device gives back is checked: a word the search would refuse is dropped and the others kept; a device that refuses keeps nothing.
import { SEARCH_Q_MAX, SEARCH_Q_MIN } from "@gnoworld/schemas";
import { jsonOf } from "@gnoworld/core";
import type { DraftStorage } from "../drafts/drafts.ts";

/** The searches kept at most. */
export const RECENT_KEPT = 5;
const KEY = "gnoworld:search:recent";

const fit = (words: unknown): words is string =>
  typeof words === "string" && words.length >= SEARCH_Q_MIN && words.length <= SEARCH_Q_MAX && words.trim() === words;

/** The recent searches on the device `storage` reaches. */
export function recentSearches(storage: () => DraftStorage) {
  const read = (): string[] => {
    try {
      const held = storage().getItem(KEY);
      if (held === null) return [];
      const value = jsonOf(held);
      if (!Array.isArray(value)) {
        storage().removeItem(KEY);
        return [];
      }
      return value.filter(fit).slice(0, RECENT_KEPT);
    } catch {
      return [];
    }
  };
  const write = (words: readonly string[]): boolean => {
    try {
      if (words.length === 0) storage().removeItem(KEY);
      else storage().setItem(KEY, JSON.stringify(words));
      return true;
    } catch {
      return false;
    }
  };
  return {
    get: read,
    /** Keeps `words` first; whether the device kept them. */
    add: (words: string): boolean => {
      const text = words.trim();
      return fit(text) && write([text, ...read().filter((each) => each !== text)].slice(0, RECENT_KEPT));
    },
    remove: (words: string): boolean => write(read().filter((each) => each !== words)),
    clear: (): boolean => write([]),
  };
}

/** The page's recent searches. */
export const pageRecent = () => recentSearches(() => localStorage);

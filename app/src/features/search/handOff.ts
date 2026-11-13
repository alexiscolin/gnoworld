// The palette's hand-off to the chat's search (slice 13, C): the typed words, handed over by a row under the results, a click, or the chord
// the row names (⌘⇧F). Plain words only: a mark (#, @, /r/, >) or an address is a place's, and words too short ask nothing of the search.
// The row is no option of the list: the arrows and Enter stay with the places.
import { SEARCH_Q_MIN } from "@gnoworld/schemas";
import { parseQuery } from "./match.ts";
import type { SearchItem } from "./types.ts";

/** The item that opens the chat's search on `query`, or none when the words are not a message search's. */
export function handOff(query: string): SearchItem | undefined {
  const words = query.trim();
  if (parseQuery(words).mode !== "name" || words.length < SEARCH_Q_MIN) return undefined;
  return { name: `Search messages for “${words}” in the chat`, kind: "messages", universe: "", path: "", find: words };
}

/** Whether a key is the chord that hands the words over: ⌘ or Ctrl with Shift and F. */
export const asksHandOff = (
  event: Pick<KeyboardEvent, "key" | "metaKey" | "ctrlKey" | "shiftKey" | "altKey">,
): boolean => event.key.toLowerCase() === "f" && (event.metaKey || event.ctrlKey) && event.shiftKey && !event.altKey;

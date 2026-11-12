// The chords that open the search palette, read by the header on every page (the search itself waits in the dialog's chunk).
import { typedIn } from "@gnoworld/ui";

export { SEARCH_HASH } from "../../lib/searchHash.ts";

/** ⌘K on a Mac, Ctrl+K elsewhere, with no other modifier: a bare k, or Shift or Alt with it, is for the page. A bare slash opens it too,
 * but never from a field. */
export function opensPalette(
  event: Pick<KeyboardEvent, "key" | "metaKey" | "ctrlKey" | "shiftKey" | "altKey"> & { target?: EventTarget | null },
): boolean {
  if (event.key === "/") return !event.metaKey && !event.ctrlKey && !event.altKey && !typedIn(event.target ?? null);
  return event.key.toLowerCase() === "k" && (event.metaKey || event.ctrlKey) && !event.shiftKey && !event.altKey;
}

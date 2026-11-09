// The chords that open the search palette, read by the header on every page (the search itself waits in the dialog's chunk).

/** The address hash that opens the palette over a page: /list goes to the home with it. */
export const SEARCH_HASH = "#search";

// A slash typed in a field is a slash.
function typesIn(target: EventTarget | null): boolean {
  const fields = "input, textarea, select, [contenteditable]:not([contenteditable='false'])";
  return target instanceof HTMLElement && target.closest(fields) !== null;
}

/** ⌘K on a Mac, Ctrl+K elsewhere, with no other modifier: a bare k, or Shift or Alt with it, is for the page. A bare slash opens it too,
 * but never from a field. */
export function opensPalette(
  event: Pick<KeyboardEvent, "key" | "metaKey" | "ctrlKey" | "shiftKey" | "altKey"> & { target?: EventTarget | null },
): boolean {
  if (event.key === "/") return !event.metaKey && !event.ctrlKey && !event.altKey && !typesIn(event.target ?? null);
  return event.key.toLowerCase() === "k" && (event.metaKey || event.ctrlKey) && !event.shiftKey && !event.altKey;
}

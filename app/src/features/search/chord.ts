// The chord that opens the search drawer, read by the header on every page (the search itself waits in the drawer's chunk).

/** ⌘K on a Mac, Ctrl+K elsewhere, with no other modifier: a bare k, or Shift or Alt with it, is for the page. */
export function opensPalette(
  event: Pick<KeyboardEvent, "key" | "metaKey" | "ctrlKey" | "shiftKey" | "altKey">,
): boolean {
  return event.key.toLowerCase() === "k" && (event.metaKey || event.ctrlKey) && !event.shiftKey && !event.altKey;
}

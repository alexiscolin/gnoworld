// The reader's intent on a link or a row: a pointer resting on it for a moment, or its focus: what it asks ahead (a plate's reads, a world's
// maps) goes only for one that stays, and never under Save-Data or a slow link.
import { fastLink } from "./lib/saveData.ts";

/** How long a pointer rests on a link before it is meant. */
export const HOVER_MS = 150;

/** Calls `run` after HOVER_MS if `element` is still pointed at or focused, and the link is a fast one. */
export function afterDwell(element: Element, run: () => void): void {
  setTimeout(() => {
    if (fastLink() && element.matches(":hover, :focus-visible")) run();
  }, HOVER_MS);
}

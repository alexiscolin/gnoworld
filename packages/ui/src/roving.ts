// The roving focus of WAI-ARIA's composite widgets (a tablist, a menu): one item in the tab order,
// the keys moving among the others.
import type { KeyboardEvent } from "react";

/** Focuses the item a key goes to, from the focused one among the widget's `selector` items: the
 * back and forth keys move one, round the ends, Home and End go to the ends. Its index, or
 * undefined for a key it does not take, which goes on to the page. */
export function rove(event: KeyboardEvent<HTMLElement>, selector: string, [back, forth]: readonly [string, string]) {
  if (![back, forth, "Home", "End"].includes(event.key)) return undefined;
  const all = [...event.currentTarget.querySelectorAll<HTMLElement>(selector)];
  const at = all.indexOf(event.target as HTMLElement);
  if (at === -1) return undefined;
  event.preventDefault();
  const moves: Record<string, number> = { Home: 0, End: all.length - 1, [back]: at - 1, [forth]: at + 1 };
  const to = ((moves[event.key] ?? at) + all.length) % all.length;
  all[to]?.focus();
  return to;
}

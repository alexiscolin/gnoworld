// The keyboard and the pointer among a room's lines (4c's message menu, docs/decisions.md 2026-10-26): the list is one
// tab stop, a line, the arrows moving among them; a line pointed at or holding the focus shows its bar.
import type { Line } from "@gnoworld/core";
import { useEffect, useState, type FocusEvent, type KeyboardEvent, type RefObject } from "react";

// The place of the line a list's event happened in, a link in its words included; -1 outside a line.
function itemAt(list: HTMLElement, target: EventTarget | null): number {
  // Up to the list's own item: a line that is a Markdown list holds items of its own (F814's class).
  let item = target instanceof Element ? target : null;
  while (item !== null && item.parentElement !== list) item = item.parentElement;
  return item === null ? -1 : Array.prototype.indexOf.call(list.children, item);
}

// The line a list's event happened in; none outside a line.
const lineAt = (lines: readonly Line[], list: HTMLElement, target: EventTarget | null): Line | undefined =>
  lines[itemAt(list, target)];

// The arrows, Home and End on a line move the focus among the lines, round the ends (WAI-ARIA's roving focus, as
// the design system's tabs and menu do); a key on a line's bar or its menu, or held with a modifier, is theirs.
const MOVES = ["ArrowUp", "ArrowDown", "Home", "End"];

/** A key pressed, with its modifiers. */
type Press = Pick<KeyboardEvent, "key" | "altKey" | "ctrlKey" | "metaKey" | "shiftKey">;

/** The line `press` moves the focus to among `count`, from the one `at` reads (-1: none, a key on a bar or a menu);
 * none for any other key. Every key the list, a bar, a menu or a dialog hears comes here: the key is read first. */
export function nextLine(press: Press, count: number, at: () => number): number | undefined {
  if (!MOVES.includes(press.key) || press.altKey || press.ctrlKey || press.metaKey || press.shiftKey) return undefined;
  const from = at();
  if (from === -1) return undefined;
  const steps: Record<string, number> = { ArrowUp: from - 1, ArrowDown: from + 1, Home: 0, End: count - 1 };
  return ((steps[press.key] ?? from) + count) % count;
}

/** The list's one tab stop: the line last chosen while the list holds it, else the newest; none in an empty list. */
export function stopOf(lines: readonly Line[], chosen: string | undefined): string | undefined {
  return lines.some((line) => line.id === chosen) ? chosen : lines.at(-1)?.id;
}

function moveAmong(event: KeyboardEvent<HTMLOListElement>) {
  const list = event.currentTarget;
  const items = list.children;
  // From a line or a link in its words (U1); a key on its bar, its menu or its dialog is theirs.
  const to = nextLine(event, items.length, () =>
    event.target instanceof Element && event.target.closest("[role='toolbar']") !== null
      ? -1
      : itemAt(list, event.target),
  );
  if (to === undefined) return;
  event.preventDefault();
  const item = items[to];
  if (item instanceof HTMLElement) item.focus();
}

/** The list's one tab stop, the line last focused while it is there, else the newest; the lines whose bars are
 * mounted; the focus handed to a neighbour when a line goes. */
export function useLineFocus(lines: readonly Line[], listRef: RefObject<HTMLOListElement | null>) {
  const [chosen, setChosen] = useState<string>();
  const [focused, setFocused] = useState<string>();
  const [pointed, setPointed] = useState<string>();
  // Whether the focus is in the focused line's bar (its More, its menu): that bar stays whatever the pointer does.
  const [held, setHeld] = useState(false);
  const stop = stopOf(lines, chosen);
  // A focused line's bar, taller than a line, comes into the list's view as the focus comes to it, the same line
  // again after the focus left the list too (G8): never as a line arrives (/code-review) or under the pointer.
  useEffect(() => {
    listRef.current?.querySelector(":scope > li:focus-within [role='toolbar']")?.scrollIntoView({ block: "nearest" });
  }, [focused, listRef]);
  const on = {
    onFocus: (event: { currentTarget: HTMLOListElement; target: EventTarget }) => {
      const line = lineAt(lines, event.currentTarget, event.target);
      setFocused(line?.id);
      setHeld(event.target instanceof Element && event.target.closest("[role='toolbar']") !== null);
      // The focus moved: its line's bar shows until the pointer moves again (U11).
      setPointed(undefined);
      if (line !== undefined) setChosen(line.id);
    },
    // Focus gone elsewhere in the page ends the line's. Gone to none, it may come back within the frame, as a menu or
    // dialog closing hands it to its opener through the page; still gone after it (a click on the page), it ends too.
    onBlur: (event: FocusEvent<HTMLOListElement>) => {
      const list = event.currentTarget;
      const to = event.relatedTarget;
      if (to !== null) {
        if (!list.contains(to)) setFocused(undefined);
        return;
      }
      requestAnimationFrame(() => {
        if (!list.contains(document.activeElement)) setFocused(undefined);
      });
    },
    onPointerOver: (event: { currentTarget: HTMLOListElement; target: EventTarget }) => {
      setPointed(lineAt(lines, event.currentTarget, event.target)?.id);
    },
    onPointerLeave: () => {
      setPointed(undefined);
    },
    onKeyDown: (event: KeyboardEvent<HTMLOListElement>) => {
      moveAmong(event);
    },
  };
  // A line about to go hands the tab stop and the focus to the one before it, else the one after.
  const leave = (id: string) => {
    const at = lines.findIndex((line) => line.id === id);
    const next = at > 0 ? at - 1 : at + 1;
    const neighbour = lines[next];
    if (neighbour === undefined) return;
    setChosen(neighbour.id);
    const item = listRef.current?.children[next];
    if (item instanceof HTMLElement) item.focus();
  };
  // One bar at a time: the pointed line's while the pointer is on the lines, else the focused line's; a bar holding
  // the focus stays beside it (U11).
  const mounted = (id: string) => (held && id === focused) || id === (pointed ?? focused);
  return { stop, mounted, on, leave };
}

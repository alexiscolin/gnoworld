// The keyboard and the pointer among a room's lines (4c's message menu, docs/decisions.md 2026-10-26): the list is one
// tab stop, a line, the arrows moving among them; a line pointed at or holding the focus shows its bar.
import type { Line } from "@gnoworld/core";
import { useEffect, useState, type FocusEvent, type KeyboardEvent, type RefObject } from "react";

// The line a list's event happened in; none outside a line.
function lineAt(lines: readonly Line[], list: HTMLElement, target: EventTarget | null): Line | undefined {
  // Up to the list's own item: a line that is a Markdown list holds items of its own (F814's class).
  let item = target instanceof Element ? target : null;
  while (item !== null && item.parentElement !== list) item = item.parentElement;
  return item === null ? undefined : lines[Array.prototype.indexOf.call(list.children, item)];
}

// The arrows, Home and End on a line move the focus among the lines, round the ends (WAI-ARIA's roving focus, as
// the design system's tabs and menu do); a key on a line's bar or its menu, or held with a modifier, is theirs.
const MOVES = ["ArrowUp", "ArrowDown", "Home", "End"];

function moveAmong(event: KeyboardEvent<HTMLOListElement>) {
  // Every key the list, a bar, a menu or a dialog hears comes here: the key first, before any line is looked at.
  if (!MOVES.includes(event.key) || event.altKey || event.ctrlKey || event.metaKey || event.shiftKey) return;
  const items = [...event.currentTarget.children];
  const at = items.findIndex((item) => item === event.target);
  const steps: Record<string, number> = { ArrowUp: at - 1, ArrowDown: at + 1, Home: 0, End: items.length - 1 };
  if (at === -1) return;
  event.preventDefault();
  const to = items[((steps[event.key] ?? at) + items.length) % items.length];
  if (to instanceof HTMLElement) to.focus();
}

/** The list's one tab stop, the line last focused while it is there, else the newest; the lines whose bars are
 * mounted; the focus handed to a neighbour when a line goes. */
export function useLineFocus(lines: readonly Line[], listRef: RefObject<HTMLOListElement | null>) {
  const [chosen, setChosen] = useState<string>();
  const [focused, setFocused] = useState<string>();
  const [pointed, setPointed] = useState<string>();
  const stop = lines.some((line) => line.id === chosen) ? chosen : lines.at(-1)?.id;
  // A focused line's bar, taller than a line, comes into the list's view as the focus comes to it: never as a line
  // arrives (/code-review) or under the pointer.
  useEffect(() => {
    listRef.current?.querySelector(":scope > li:focus-within [role='toolbar']")?.scrollIntoView({ block: "nearest" });
  }, [chosen, listRef]);
  const on = {
    onFocus: (event: { currentTarget: HTMLOListElement; target: EventTarget }) => {
      const line = lineAt(lines, event.currentTarget, event.target);
      setFocused(line?.id);
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
  return { stop, mounted: (id: string) => id === focused || id === pointed, on, leave };
}

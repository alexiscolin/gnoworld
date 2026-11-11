// The keyboard and the pointer among a room's lines (4c's message menu, docs/decisions.md 2026-10-26): the list is one
// tab stop, a line, the arrows moving among them; a line pointed at or holding the focus shows its bar.
import type { Line } from "@gnoworld/core";
import {
  useEffect,
  useRef,
  useState,
  type FocusEvent,
  type KeyboardEvent,
  type MouseEvent,
  type RefObject,
} from "react";
import { nextLine } from "../../lib/nextLine.ts";

// The list's lines: its items but the chain's cards (a room's thread holds them among its lines), which no key stops on.
const linesOf = (list: HTMLElement): Element[] => [...list.children].filter((item) => !item.hasAttribute("data-chain"));

// The place of the line a list's event happened in, a link in its words included; -1 outside a line.
function itemAt(list: HTMLElement, target: EventTarget | null): number {
  // Up to the list's own item: a line that is a Markdown list holds items of its own (F814's class).
  let item = target instanceof Element ? target : null;
  while (item !== null && item.parentElement !== list) item = item.parentElement;
  return item === null ? -1 : linesOf(list).indexOf(item);
}

// The line a list's event happened in; none outside a line.
const lineAt = (lines: readonly Line[], list: HTMLElement, target: EventTarget | null): Line | undefined =>
  lines[itemAt(list, target)];

// The arrows, Home and End on a line move the focus among the lines, round the ends (lib/nextLine.ts, as the design system's tabs and menu
// do); a key on a line's bar or its menu, or held with a modifier, is theirs.
export { nextLine };

/** The list's one tab stop: the line last chosen while the list holds it, else the one marked New (`fresh`, the
 * keyboard's way to the first news) while it does, else the newest; none in an empty list. */
export function stopOf(lines: readonly Line[], chosen: string | undefined, fresh?: string): string | undefined {
  const has = (id: string | undefined) => lines.some((line) => line.id === id);
  return has(chosen) ? chosen : has(fresh) ? fresh : lines.at(-1)?.id;
}

function moveAmong(event: KeyboardEvent<HTMLOListElement>) {
  const list = event.currentTarget;
  const items = linesOf(list);
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

// Where a right-click, a long-press or the context-menu key asks for a line's menu, when it is on the line's own words: not on
// a link, a control, or the bar and its menu, which keep the browser's menu or their own.
const OWN = "a, button, input, textarea, [role='textbox'], [role='toolbar'], [role='menu'], [role='dialog']";

/** The point a line's menu opens at: the pointer's, or the line's own corner when the key asked, which gives no pointer. */
export const menuPoint = (
  { clientX, clientY }: { clientX: number; clientY: number },
  { left, top }: { left: number; top: number },
): { x: number; y: number } => (clientX === 0 && clientY === 0 ? { x: left, y: top } : { x: clientX, y: clientY });

/** A line's menu asked: which line, and the screen point. */
export interface MenuAsk {
  id: string;
  x: number;
  y: number;
}

// The menu asked, while the pointer or the focus is still on its line.
const stays = (was: MenuAsk | undefined, id: string | undefined) =>
  was !== undefined && was.id === id ? was : undefined;

/** The list's one tab stop (`stopOf`, with `fresh` the line marked New); the lines whose bars are mounted; the focus
 * handed to a neighbour when a line goes. */
export function useLineFocus(lines: readonly Line[], listRef: RefObject<HTMLOListElement | null>, fresh?: string) {
  const [chosen, setChosen] = useState<string>();
  const [focused, setFocused] = useState<string>();
  const [pointed, setPointed] = useState<string>();
  // Whether the focus is in the focused line's bar (its More, its menu): that bar stays whatever the pointer does.
  const [held, setHeld] = useState(false);
  // The line whose More menu was asked at a point (a right-click, the context-menu key): its bar is mounted to hold it.
  const [asked, setAsked] = useState<MenuAsk>();
  const stop = stopOf(lines, chosen, fresh);
  // Whether the pointer is pressed in the list, off the bar: the focus it gives is no reason to move the list, which would carry the
  // line from under the pointer between the press and the release and lose the click (a chip, a link).
  const pressedRef = useRef(false);
  // A focused line's bar, taller than a line, comes into the list's view as the focus comes to it, the same line
  // again after the focus left the list too (G8): never as a line arrives (/code-review) or under the pointer.
  useEffect(() => {
    if (pressedRef.current) return;
    listRef.current?.querySelector(":scope > li:focus-within [role='toolbar']")?.scrollIntoView({ block: "nearest" });
  }, [focused, listRef]);
  const on = {
    onFocus: (event: { currentTarget: HTMLOListElement; target: EventTarget }) => {
      const line = lineAt(lines, event.currentTarget, event.target);
      setFocused(line?.id);
      setAsked((was) => stays(was, line?.id));
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
      const id = lineAt(lines, event.currentTarget, event.target)?.id;
      setPointed(id);
      setAsked((was) => stays(was, id));
    },
    onPointerLeave: () => {
      setPointed(undefined);
    },
    // A press on the bar's own controls keeps the bar in view, as before: only a line's words, a chip, a link, are pressed.
    onPointerDown: (event: { target: EventTarget }) => {
      pressedRef.current = !(event.target instanceof Element && event.target.closest("[role='toolbar']") !== null);
      // Released anywhere, outside the list too: a press dragged off it would else leave the list thinking it is held (27).
      if (pressedRef.current) {
        const until = new AbortController();
        const release = () => {
          pressedRef.current = false;
          until.abort();
        };
        document.addEventListener("pointerup", release, { signal: until.signal });
        document.addEventListener("pointercancel", release, { signal: until.signal });
      }
    },
    onKeyDown: (event: KeyboardEvent<HTMLOListElement>) => {
      moveAmong(event);
    },
    onContextMenu: (event: MouseEvent<HTMLOListElement>) => {
      const list = event.currentTarget;
      if (event.target instanceof Element && event.target.closest(OWN) !== null) return;
      const at = itemAt(list, event.target);
      const line = lines[at];
      const item = linesOf(list)[at];
      if (line === undefined || item === undefined) return;
      event.preventDefault();
      setAsked({ id: line.id, ...menuPoint(event, item.getBoundingClientRect()) });
    },
  };
  // A line about to go hands the tab stop and the focus to the one before it, else the one after.
  const leave = (id: string) => {
    const at = lines.findIndex((line) => line.id === id);
    const next = at > 0 ? at - 1 : at + 1;
    const neighbour = lines[next];
    if (neighbour === undefined) return;
    setChosen(neighbour.id);
    const item = listRef.current === null ? undefined : linesOf(listRef.current)[next];
    if (item instanceof HTMLElement) item.focus();
  };
  // One bar at a time: the pointed line's while the pointer is on the lines, else the focused line's; a bar holding
  // the focus stays beside it (U11).
  const mounted = (id: string) => (held && id === focused) || id === (pointed ?? focused) || id === asked?.id;
  return { stop, mounted, on, leave, asked };
}

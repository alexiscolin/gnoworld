// The DOM a room works on (alone.tsx): the room the open card fills, what is hidden while it is open, the scroll put back, the move begun and played, and what a
// reader who cannot see is told.
import { canMove, fadeIn, fadeOut, grow, othersOf } from "./flip.ts";

// The share of the screen's height a page that scrolls as a whole gives the opened card (its header and margins take the rest).
const SHARE = 0.85;

// The height the opened card fills: the scroller's own on a wide plate, most of the screen on a page that scrolls as a whole.
function roomOf(scroller: HTMLElement): number {
  const style = getComputedStyle(scroller);
  const pad = Number.parseFloat(style.paddingBlockStart) + Number.parseFloat(style.paddingBlockEnd);
  return Math.max(0, Math.min(scroller.clientHeight, window.innerHeight * SHARE) - (Number.isNaN(pad) ? 0 : pad));
}

export const scrollerOf = (node: HTMLElement | null) => node?.closest<HTMLElement>("[data-content]") ?? null;

// The room the opened card fills, set on the element that holds the cards.
export function measure(node: HTMLElement | null) {
  const box = scrollerOf(node);
  if (box !== null) node?.style.setProperty("--plate-room", `${String(roomOf(box))}px`);
}

// An Escape is the card's when the focus is on the page or in the plate: not when it is in another part of the screen (the chat's composer, a panel).
export const elsewhere = (root: HTMLElement | null) => {
  const focus = document.activeElement;
  return focus !== null && focus !== document.body && root?.contains(focus) !== true;
};

export interface Back {
  scroll: number;
  /** The page's own scroll, where the plate is a block of the page. */
  page: number;
  from: HTMLElement | undefined;
  card: HTMLElement | null;
}

// The move that waits for the next commit: the card's box before it, and the fades that hold the others away till then.
export interface Move {
  card: HTMLElement;
  first: DOMRect;
  fades: Animation[];
}

// The plate scrolled where it was on a close, at its top on an open: the scroller's own, and the page's where the plate is a block of it.
function scrolled(box: HTMLElement | null, open: string | undefined, back: Back | undefined) {
  if (box !== null) box.scrollTop = open === undefined ? (back?.scroll ?? box.scrollTop) : 0;
  const page = open === undefined ? (back?.page ?? window.scrollY) : 0;
  if (window.scrollY !== page) window.scrollTo(0, page);
}

// The blocks off the card's way are marked while it is open, and unmarked at the close: only they restyle, never the plate's whole tree.
export function hide(box: HTMLElement | null, open: string | undefined, back: Back | undefined) {
  if (box === null) return;
  if (open === undefined) {
    for (const node of box.querySelectorAll("[data-aside]")) node.removeAttribute("data-aside");
    return;
  }
  if (back?.card == null) return;
  for (const node of othersOf(back.card, box)) node.setAttribute("data-aside", "");
}

// What was hidden is shown again, and what was moving stops.
export function release(box: HTMLElement | null, move: Move | undefined) {
  for (const node of box?.querySelectorAll("[data-aside]") ?? []) node.removeAttribute("data-aside");
  for (const fade of move?.fades ?? []) fade.cancel();
}

// What a reader who cannot see is told: the hidden blocks are out of the accessibility tree while the card is open.
export const nameOf = (card: HTMLElement | null) =>
  document.getElementById(card?.getAttribute("aria-labelledby") ?? "")?.textContent ?? "A card";
export const OPENED = (name: string) =>
  `${name} is open on its own and the rest of the page is hidden. Press Escape to go back.`;
export const CLOSED = "Back to the page.";

// The swap laid out: the scroll, and the focus on the button that opened the card once it is closed.
export function place(box: HTMLElement | null, open: string | undefined, back: Back | undefined) {
  hide(box, open, back);
  scrolled(box, open, back);
  if (open === undefined) back?.from?.focus({ preventScroll: true });
}

// The card moving into place, and on a close the others coming back.
export function play(box: HTMLElement | null, open: string | undefined, move: Move) {
  for (const fade of move.fades) fade.cancel();
  grow(move.card, move.first);
  if (open === undefined && box !== null) fadeIn(othersOf(move.card, box));
}

// The move a change makes, started: none where the card cannot move, or where one card gives way to another. The others fade first on an open.
export function begin(
  box: HTMLElement | null,
  card: HTMLElement | null,
  kind: "open" | "close" | "switch",
): Move | undefined {
  if (card === null || box === null || kind === "switch" || !canMove()) return undefined;
  return { card, first: card.getBoundingClientRect(), fades: kind === "open" ? fadeOut(othersOf(card, box)) : [] };
}

// The card a click on `from` opens, or the one open now.
export const cardOf = (from: HTMLElement | undefined, back: Back | undefined) =>
  from?.closest<HTMLElement>("article") ?? back?.card ?? null;

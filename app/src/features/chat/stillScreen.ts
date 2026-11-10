// A still copy of the chat's screen, which a move draws while the live one changes under it: the room the chat leaves, as it stood, kept
// from the moment its place changes to the commit that draws the next one (swapMove.ts), and its scrolled lists' places.
import { stillCopy } from "@gnoworld/ui";
const FRESH_MS = 5000;

/** Where each list of `root` is scrolled, by its place among its parts: a node taken out of the document starts again at the top. */
export const scrollsOf = (root: Element): (readonly [number, number])[] =>
  [...root.querySelectorAll("*")].flatMap((part, at) => (part.scrollTop > 0 ? [[at, part.scrollTop] as const] : []));

/** Puts the lists of `root`, now in the document, back where `scrolls` says. */
export function restoreScrolls(root: Element, scrolls: readonly (readonly [number, number])[]): void {
  const parts = root.querySelectorAll("*");
  for (const [at, top] of scrolls) parts[at]?.scrollTo({ top });
}

/** What the chat left: the key of the place it showed, its still copy and the lists' places. */
export interface Left {
  key: string;
  copy: HTMLElement;
  scrolls: readonly (readonly [number, number])[];
  at: number;
}

let left: Left | undefined;

// A screen's still copy (the design system's), out of focus and no longer a chat screen: the page finds the live one alone.
function unmarked(screen: Element): HTMLElement | undefined {
  const copy = stillCopy(screen);
  if (copy === undefined) return undefined;
  copy.inert = true;
  for (const marked of [copy, ...copy.querySelectorAll("[data-chat-screen]")])
    marked.removeAttribute("data-chat-screen");
  return copy;
}

/** The place a screen shows, as a key: a move to another changes it. */
export const keyOf = ({ slug, name }: { slug: string; name: string }): string => `${slug}/${name}`;

/** Before the chat shows another place: its screen in view, copied, for the move that follows. */
export function leaveRoom(key: string): void {
  const screen = document.querySelector("[data-chat-screen]:not([inert]):not([data-ghost] *)");
  const copy = screen === null ? undefined : unmarked(screen);
  if (screen === null || copy === undefined) return;
  left = { key, copy, scrolls: scrollsOf(screen), at: performance.now() };
}

/** What the chat left for a screen that shows `key` now, taken once; none when it left nothing, the same place, or long ago. */
export function takeLeft(key: string): Left | undefined {
  const was = left;
  if (was === undefined || was.key === key) return undefined;
  left = undefined;
  return performance.now() - was.at < FRESH_MS ? was : undefined;
}

// What the full chat's mark sets for its parts (ChatScreen.module.css), which its copy keeps without the mark.
const KEPT = ["--font-chat", "--chat-head", "--chat-inset"];

/** The full chat's screen as it stands, copied for the move that closes it: its box, where its lists were scrolled, the copy not in the page yet. */
export interface Closing {
  copy: HTMLElement;
  box: DOMRect;
  scrolls: readonly (readonly [number, number])[];
}

export function stillFull(screen: HTMLElement): Closing | undefined {
  const copy = unmarked(screen);
  if (copy === undefined) return undefined;
  const box = screen.getBoundingClientRect();
  const look = getComputedStyle(screen);
  // Its class goes, its mark stays: the copy keeps the full chat's layout under the site's header (ChatScreen.module.css), and stands
  // for no open chat (`.screen[data-full]`).
  copy.className = "";
  for (const name of KEPT) copy.style.setProperty(name, look.getPropertyValue(name));
  copy.style.cssText += `;position:fixed;margin:0;z-index:3;pointer-events:none;left:${String(box.left)}px;top:${String(box.top)}px;width:${String(box.width)}px;height:${String(box.height)}px`;
  return { copy, box, scrolls: scrollsOf(screen) };
}

let closing: Closing | undefined;

/** Before the full chat shows as a dock: its screen in sight copied, the commit changing it after. */
export function leaveFull(): void {
  const screen = document.querySelector("[data-chat-screen][data-full]:not([data-ghost] *)");
  closing = screen instanceof HTMLElement ? stillFull(screen) : undefined;
}

/** What `leaveFull` copied, taken once. */
export function takeClosing(): Closing | undefined {
  const was = closing;
  closing = undefined;
  return was;
}

// The motion of a card opening alone (D13979), by hand on the compositor (opacity and transform only, never a layout or a repaint per frame): the plate's
// other blocks fade and settle away, then the card grows from its cell to the pane; closing, the card shrinks back to its cell while the others come in
// one after another. The card is laid out where it ends and drawn where it began (a FLIP), its words appearing only as it nears its size.
import { motionWelcome } from "./motion.ts";

const SETTLE = 8;
const STEP = 40;
// The share of the move before which the card's words wait, so they are never seen stretched.
const WORDS = 0.45;

function timing() {
  const style = getComputedStyle(document.documentElement);
  const scale = Number.parseFloat(style.getPropertyValue("--motion-scale") || "1");
  const ms = Number.parseFloat(style.getPropertyValue("--motion-slow")) * scale;
  return { ms: Number.isNaN(ms) ? 0 : ms, easing: style.getPropertyValue("--ease-standard").trim() || "ease" };
}

/** Whether the card can move: the browser animates, the reader welcomes motion and the app's calm setting is not on. */
export const canMove = () => typeof Element.prototype.animate === "function" && motionWelcome() && timing().ms > 0;

/** What is not the card nor holds it, up to `top`: the siblings along its way in the page's order, which the sheet hides while it is open. */
export function othersOf(card: HTMLElement, top: HTMLElement): HTMLElement[] {
  const others: HTMLElement[] = [];
  for (let node: HTMLElement = card; node !== top && node.parentElement !== null; node = node.parentElement) {
    for (const sibling of node.parentElement.children)
      if (sibling !== node && sibling instanceof HTMLElement && sibling.getAttribute("role") !== "status")
        others.push(sibling);
  }
  return others.sort((a, b) => (a.compareDocumentPosition(b) & Node.DOCUMENT_POSITION_FOLLOWING ? -1 : 1));
}

/** The others fade and settle away, and stay gone until cancelled. */
export function fadeOut(others: readonly HTMLElement[]): Animation[] {
  const { ms, easing } = timing();
  return others.map((node) =>
    node.animate(
      [
        { opacity: 1, transform: "none" },
        { opacity: 0, transform: `translateY(${String(SETTLE)}px)` },
      ],
      { duration: ms * WORDS, easing, fill: "forwards" },
    ),
  );
}

/** The others come back, in their order of arrival. */
export function fadeIn(others: readonly HTMLElement[]) {
  const { ms, easing } = timing();
  others.forEach((node, at) => {
    node.animate(
      [
        { opacity: 0, transform: `translateY(${String(SETTLE)}px)` },
        { opacity: 1, transform: "none" },
      ],
      { duration: ms, easing, delay: at * STEP, fill: "backwards" },
    );
  });
}

/** The card, laid out as it now is, drawn from the box `first` it had: it grows or shrinks into place. */
export function grow(card: HTMLElement, first: DOMRect) {
  const { ms, easing } = timing();
  const last = card.getBoundingClientRect();
  if (last.width === 0 || last.height === 0) return;
  const from = `translate(${String(first.left - last.left)}px, ${String(first.top - last.top)}px) scale(${String(first.width / last.width)}, ${String(first.height / last.height)})`;
  card.animate(
    [
      { transformOrigin: "0 0", transform: from },
      { transformOrigin: "0 0", transform: "none" },
    ],
    { duration: ms, easing },
  );
  card.firstElementChild?.animate([{ opacity: 0 }, { opacity: 0, offset: WORDS }, { opacity: 1 }], {
    duration: ms,
    easing: "linear",
  });
}

// The views' pill's fill, one for the three views (D369): it stands under the current view's link and glides to the next one as the page
// changes. The links move while it goes (in the full chat their names fold and the pill's left edge runs, D503), so the fill is the link's
// own place as it stands each frame plus a gap that dies away without a turn: it never goes past its link and back, as a target read once
// did when the names then folded. Places are the pill's own (a link's box less the pill's), so a move of the header as a whole is not one.
import { motionWelcome } from "@gnoworld/ui";
import { useLayoutEffect, type RefObject } from "react";
import { useLocation } from "react-router";

/** How far, in px, the fill may stand from its link to count as arrived. */
const ARRIVED = 0.25;
/** The gap's time constant: it falls by e every this many ms (gone in about three of them). */
const EASE_MS = 110;

interface Place {
  x: number;
  width: number;
}

const placeOf = (nav: HTMLElement, link: HTMLElement): Place => {
  const { left, width } = link.getBoundingClientRect();
  return { x: left - nav.getBoundingClientRect().left, width };
};

const write = (nav: HTMLElement, { x, width }: Place) => {
  nav.style.setProperty("--_fill-x", `${String(x)}px`);
  nav.style.setProperty("--_fill-w", `${String(width)}px`);
  nav.dataset["filled"] = "";
};

// Where the fill stands as the pill's own properties say, none before its first place or while no level is in view.
export const standing = (nav: HTMLElement): Place | undefined => {
  if (nav.dataset["empty"] !== undefined) return undefined;
  const [x, width] = ["--_fill-x", "--_fill-w"].map((name) => Number.parseFloat(nav.style.getPropertyValue(name)));
  return x === undefined || width === undefined || Number.isNaN(x + width) ? undefined : { x, width };
};

const current = (nav: HTMLElement) => nav.querySelector<HTMLElement>("a[aria-current='page']");

// Keeps the fill under the current link of `nav`: each frame while it has a gap to close, and again whenever a link changes size or the mark
// moves; the way to stop.
function follow(nav: HTMLElement): () => void {
  // The gap between the fill and its link and the link it was read for, and where the fill stands.
  let [gap, linked, shown] = [{ x: 0, width: 0 }, null as HTMLElement | null, standing(nav)];
  let [frame, last] = [0, 0];
  const step = (now: number) => {
    frame = 0;
    const link = current(nav);
    // No level in view: the fill fades where it stands, and the next level's comes back in its place rather than gliding from here.
    if (link === null) {
      nav.dataset["empty"] = "";
      [linked, shown, gap] = [null, undefined, { x: 0, width: 0 }];
      return;
    }
    delete nav.dataset["empty"];
    const goal = placeOf(nav, link);
    const still = !motionWelcome();
    // A new link to stand under (the mark moves to it a render after the page): the gap from where the fill is now.
    if (link !== linked) {
      gap = shown === undefined || still ? gap : { x: shown.x - goal.x, width: shown.width - goal.width };
      linked = link;
    }
    const kept = still ? 0 : Math.exp(-Math.min(Math.max(now - last, 0), 50) / EASE_MS);
    last = now;
    gap = { x: gap.x * kept, width: gap.width * kept };
    const arrived = Math.abs(gap.x) < ARRIVED && Math.abs(gap.width) < ARRIVED;
    shown = arrived ? goal : { x: goal.x + gap.x, width: goal.width + gap.width };
    write(nav, shown);
    if (!arrived) frame = requestAnimationFrame(step);
  };
  const go = () => {
    if (frame === 0) {
      last = performance.now();
      frame = requestAnimationFrame(step);
    }
  };
  go();
  const sized = new ResizeObserver(go);
  const marked = new MutationObserver(go);
  marked.observe(nav, { attributes: true, attributeFilter: ["aria-current"], subtree: true });
  for (const part of [nav, ...nav.querySelectorAll(":scope > *, a")]) sized.observe(part);
  return () => {
    cancelAnimationFrame(frame);
    sized.disconnect();
    marked.disconnect();
  };
}

/** The fill stands under the current view's link (`data-filled` on the pill, set at its first frame); at each change of page or of the
 * links' width it glides from where it stood. */
export function useViewsIndicator(bar: RefObject<HTMLElement | null>, view: string | undefined, drawn: boolean) {
  const { key } = useLocation();
  useLayoutEffect(() => {
    const nav = bar.current;
    return nav === null ? undefined : follow(nav);
  }, [bar, view, drawn, key]);
}

// Where a box in the top layer goes: beside its anchor, inside the screen. A small function of ours
// until CSS anchor positioning is widely available (docs/DESIGN-SYSTEM.md, "Browsers").
import { useLayoutEffect, type RefObject } from "react";
import shared from "./surface.module.css";

/** What floats over the page wears, the dialog included: the surface's class and a box's own. */
export function surface(own: string | undefined) {
  return [shared["surface"], own].join(" ");
}

/** A box in the top layer, placed in script and faded in: the surface's classes and its own. */
export function floating(own: string | undefined) {
  return [shared["surface"], shared["floating"], "appears", own].join(" ");
}

interface Placing {
  side: "above" | "below";
  align: "start" | "center";
}

/** The side of the anchor the box takes (its own, or the other when it does not fit there), its top, and the height it shows: when neither
 * side holds it (a phone turned on its side) the roomier side, the box capped to it and scrolling inside, clear of its anchor. */
function vertical(
  at: DOMRect,
  height: number,
  { step, screen, side }: { step: number; screen: number; side: Placing["side"] },
) {
  const spots = { below: at.bottom + step, above: at.top - step - height };
  const fits = { below: spots.below + height <= screen - step, above: spots.above >= step };
  const other = side === "below" ? "above" : "below";
  if (!fits.below && !fits.above) {
    const room = { below: screen - step - spots.below, above: at.top - 2 * step };
    const chosen = room.below >= room.above ? "below" : "above";
    const shown = Math.min(height, room[chosen]);
    return { chosen, shown, top: chosen === "below" ? spots.below : at.top - step - shown };
  }
  const chosen = fits[side] ? side : other;
  return { chosen, shown: height, top: spots[chosen] };
}

/** Puts the box on its side of the anchor, or the other one when it does not fit there, and slides it
 * to stay a step inside the screen's edges: centred, or from the anchor's start. A box kept unseen
 * until placed is seen from then on. */
function place(anchor: Element, box: HTMLElement, { side, align }: Placing) {
  const at = anchor.getBoundingClientRect();
  // Its own size: the enter draws it scaled (surface.module.css), and a box placed by that smaller size stays that much too near.
  const scale = Number.parseFloat(getComputedStyle(box).scale) || 1;
  const drawn = box.getBoundingClientRect();
  // Its natural height: a box capped below (max-block-size) and scrolling inside still counts what it holds, so the cap never feeds back.
  const natural = box.scrollHeight + box.offsetHeight - box.clientHeight;
  const [width, height] = [drawn.width / scale, Math.max(drawn.height, natural) / scale];
  const { clientWidth, clientHeight } = document.documentElement;
  // A step off the screen's edges: 8 px, or what the box asks (--_edge, a phone's 16).
  const styled = getComputedStyle(box);
  const step = Number.parseFloat(styled.getPropertyValue("--_edge") || styled.getPropertyValue("--space-2xs")) || 0;
  const { chosen, top, shown } = vertical(at, height, { step, screen: clientHeight, side });
  box.style.removeProperty("max-block-size");
  if (shown < height) box.style.maxBlockSize = `${String(shown)}px`;
  let start = at.left;
  if (align === "center") start = at.left + (at.width - width) / 2;
  else if (getComputedStyle(anchor).direction === "rtl") start = at.right - width;
  const left = Math.max(step, Math.min(start, clientWidth - step - width));
  box.style.left = `${String(left)}px`;
  // It grows from its trigger's middle, on the side it faces: the exit's travel is toward it too (surface.module.css).
  box.style.setProperty("--_dir", chosen === "below" ? "-1" : "1");
  box.style.transformOrigin = `${String(at.left + at.width / 2 - left)}px ${chosen === "below" ? "0" : "100%"}`;
  box.style.top = `${String(Math.max(step, Math.min(top, clientHeight - step - shown)))}px`;
  box.style.removeProperty("visibility");
}

/** Keeps an open box placed by its anchor while the page scrolls, the window resizes or the box itself changes size; placed again whenever
 * `again` changes, a box shown late among them. */
export function usePlaced(
  anchor: RefObject<Element | null>,
  box: RefObject<HTMLElement | null>,
  { open, side, align, again = 0 }: Placing & { open: boolean; again?: number },
) {
  useLayoutEffect(() => {
    if (!open) return;
    const again = () => {
      if (anchor.current !== null && box.current !== null) place(anchor.current, box.current, { side, align });
    };
    again();
    const stop = new AbortController();
    addEventListener("scroll", again, { capture: true, passive: true, signal: stop.signal });
    addEventListener("resize", again, { signal: stop.signal });
    // A box whose content arrives after it opens (a card's blocks) grows, and is placed again for its new size.
    const grows = typeof ResizeObserver === "function" ? new ResizeObserver(again) : undefined;
    if (box.current !== null) grows?.observe(box.current);
    return () => {
      stop.abort();
      grows?.disconnect();
    };
  }, [anchor, box, open, side, align, again]);
}

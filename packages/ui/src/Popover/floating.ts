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
  return [shared["surface"], shared["floating"], own].join(" ");
}

interface Placing {
  side: "above" | "below";
  align: "start" | "center";
}

/** Puts the box on its side of the anchor, or the other one when it does not fit there, and slides it
 * along the edge to stay a step inside the screen: centred, or from the anchor's start. A box kept
 * unseen until placed is seen from then on. */
function place(anchor: Element, box: HTMLElement, { side, align }: Placing) {
  const at = anchor.getBoundingClientRect();
  const { width, height } = box.getBoundingClientRect();
  const { clientWidth, clientHeight } = document.documentElement;
  const step = Number.parseFloat(getComputedStyle(box).getPropertyValue("--space-2xs")) || 0;
  const below = at.bottom + step;
  const above = at.top - step - height;
  const fits = { below: below + height <= clientHeight - step, above: above >= step };
  const other = side === "below" ? "above" : "below";
  const top = fits[side] || !fits[other] ? { below, above }[side] : { below, above }[other];
  const rtl = getComputedStyle(anchor).direction === "rtl";
  const start = align === "center" ? at.left + (at.width - width) / 2 : rtl ? at.right - width : at.left;
  box.style.left = `${String(Math.max(step, Math.min(start, clientWidth - step - width)))}px`;
  box.style.top = `${String(top)}px`;
  box.style.removeProperty("visibility");
}

/** Keeps an open box placed by its anchor while the page scrolls or the window resizes. */
export function usePlaced(
  anchor: RefObject<Element | null>,
  box: RefObject<HTMLElement | null>,
  { open, side, align }: Placing & { open: boolean },
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
    return () => {
      stop.abort();
    };
  }, [anchor, box, open, side, align]);
}

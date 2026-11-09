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
 * to stay a step inside the screen's edges: centred, or from the anchor's start. A box kept unseen
 * until placed is seen from then on. */
function place(anchor: Element, box: HTMLElement, { side, align }: Placing) {
  const at = anchor.getBoundingClientRect();
  const { width, height } = box.getBoundingClientRect();
  const { clientWidth, clientHeight } = document.documentElement;
  const step = Number.parseFloat(getComputedStyle(box).getPropertyValue("--space-2xs")) || 0;
  const spots = { below: at.bottom + step, above: at.top - step - height };
  const fits = { below: spots.below + height <= clientHeight - step, above: spots.above >= step };
  const other = side === "below" ? "above" : "below";
  const chosen = fits[side] || !fits[other] ? side : other;
  const top = spots[chosen];
  let start = at.left;
  if (align === "center") start = at.left + (at.width - width) / 2;
  else if (getComputedStyle(anchor).direction === "rtl") start = at.right - width;
  const left = Math.max(step, Math.min(start, clientWidth - step - width));
  box.style.left = `${String(left)}px`;
  // It grows from its trigger's middle, on the side it faces: the exit's travel is toward it too (surface.module.css).
  box.style.setProperty("--_dir", chosen === "below" ? "-1" : "1");
  box.style.transformOrigin = `${String(at.left + at.width / 2 - left)}px ${chosen === "below" ? "0" : "100%"}`;
  box.style.top = `${String(Math.max(step, Math.min(top, clientHeight - step - height)))}px`;
  box.style.removeProperty("visibility");
}

/** Keeps an open box placed by its anchor while the page scrolls or the window resizes; placed again whenever
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
    return () => {
      stop.abort();
    };
  }, [anchor, box, open, side, align, again]);
}

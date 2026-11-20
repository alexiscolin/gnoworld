import type { Circle } from "../../space/goals.ts";

/** The least room between the plate's right edge and the dock: narrower, a system is too small to read there (the page's circle holds it
 * then) and the plate stands over the planet, as on a narrow page. 240 px before the plate's 24 px of air (D14002), so 1280 keeps it. */
export const LEAST_ROOM = 216;

// The room between the plate's right edge and the dock's left, where the Map stands a system; none where they share no row or leave too little (a narrow page).
function freeRoom(): Circle["free"] {
  const plate = document.querySelector("[data-look='plate']")?.getBoundingClientRect();
  const dock = document.querySelector("[data-dock]")?.getBoundingClientRect();
  if (plate === undefined || dock === undefined || dock.left - plate.right < LEAST_ROOM) return undefined;
  return { left: plate.right, right: dock.left };
}

// The circle of the page's `[data-globe]` box, none where it keeps none (or keeps it unseen), with the room beside the plate; its planet
// framed close where the page frames it so.
export function circleOf(globe: HTMLElement | null): Circle | undefined {
  if (globe === null) return undefined;
  const box = globe.getBoundingClientRect();
  if (box.width === 0) return undefined;
  return {
    x: box.left + box.width / 2,
    y: box.top + box.height / 2,
    radius: box.width / 2,
    width: innerWidth,
    height: innerHeight,
    free: freeRoom(),
    close: globe.dataset["framing"] !== undefined,
  };
}

/** The page's plate, in the page's pixels, and where its fill starts to fade: --plate-fade short of its right edge, as its own fill
 * (Panel.module.css), past its content's air; at its edge where it draws no fill of its own (under 1280 px). None with no plate. */
export function plateOf(): { readonly box: DOMRect; readonly fade: number } | undefined {
  const plate = document.querySelector("[data-look='plate']");
  if (plate === null) return undefined;
  const box = plate.getBoundingClientRect();
  const fill = plate.querySelector("[data-fill]");
  if (fill === null || getComputedStyle(fill).display === "none") return { box, fade: box.right };
  return { box, fade: box.right - (parseFloat(getComputedStyle(plate).getPropertyValue("--plate-fade")) || 0) };
}

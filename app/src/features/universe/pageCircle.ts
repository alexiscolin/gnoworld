import type { Circle } from "../../space/goals.ts";

// raw: a room narrower than this leaves a system too small to read: the page's circle holds it then
const LEAST = 240;

// The room between the plate's right edge and the dock's left, where the Map stands a system; none where they share no row or leave too little (a narrow page).
function freeRoom(): Circle["free"] {
  const plate = document.querySelector("[data-look='plate']")?.getBoundingClientRect();
  const dock = document.querySelector("[data-dock]")?.getBoundingClientRect();
  if (plate === undefined || dock === undefined || dock.left - plate.right < LEAST) return undefined;
  return { left: plate.right, right: dock.left };
}

// The circle of the page's `[data-globe]` box, none where it keeps none (or keeps it unseen), with the room beside the plate; its planet
// framed close where the page frames it so (D458).
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

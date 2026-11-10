// A page opened from its URL shows its scene once its planet stands as itself (its maps on the GPU), never its quad swapped for it in one frame
// (features/universe/firstLook.ts); a planet that does not come within SHARP_MS shows as it is.
import { aloneOf } from "./framing.ts";
import type { Space } from "./scene.ts";

export const SHARP_MS = 4000;
/** The canvas's own event, heard by features/universe/firstLook.ts. */
export const SHARP = "sharp";

/** The frame's word, each frame, that the page's planet is itself: it tells the canvas, once. */
export function sharpener(space: Space, began: number): (now: number) => void {
  let done = false;
  return (now) => {
    if (done || (space.universe === undefined && now - began < SHARP_MS)) return;
    const page = aloneOf(space);
    if (page !== undefined && space.stage.near?.shows(page.index) !== true && now - began < SHARP_MS) return;
    done = true;
    space.options.canvas.dispatchEvent(new Event(SHARP));
  };
}

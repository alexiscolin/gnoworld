// The Earth's full-size maps swapped in behind the half-size ones it was built from: sent to the GPU one a frame, only on a frame that sent
// no other map, then handed to its material at once, so no frame pays for all three and the swap is one frame's change of detail.
import type { WebGLRenderer } from "three";
import type { Held } from "./held.ts";
import type { Maps } from "./maps.ts";

/** One frame's step of `held`'s upgrade to the Earth's full maps (none yet: nothing to do). */
export function upgradeStep(held: Held, maps: Maps, renderer: WebGLRenderer): void {
  const full = maps.fullEarth();
  if (full === undefined || held.upgraded) return;
  held.pending ??= [full.clouds, full.night, full.day];
  const next = held.pending.pop();
  if (next !== undefined) renderer.initTexture(next);
  else {
    held.drawn.setEarthMaps(full);
    held.upgraded = true;
    maps.settleFull();
  }
}

// The Earth's full-size maps swapped in behind the half-size ones it was built from, where they came after it was made: sent to the GPU one a
// frame, only on a frame that sent no other map and with no flight running, so no frame pays for all three. Swapped in, they come into focus
// over a second, the half-size ones mixed in under them (surfaceShader.ts's FOCUS), which then go: Alexis saw the one frame's sharpening in
// Firefox, where they come after the arrival. A limit on their finest level would not do: the half-size day is softer than any of them.
import type { WebGLRenderer } from "three";
import { eased, LONGEST_S } from "./arrival.ts";
import type { Held } from "./held.ts";
import type { Maps } from "./maps.ts";
import { mapsOf } from "./mapsOf.ts";

/** How long the full maps take to come into focus, in seconds. */
export const FOCUS_S = 1;

interface Device {
  readonly maps: Maps;
  readonly renderer: WebGLRenderer;
}

/** A frame: its seconds, whether motion is reduced (no focus: at once), and whether a flight runs or a map was sent (nothing swapped). */
interface Frame {
  readonly delta: number;
  readonly still: boolean;
  readonly busy: boolean;
}

// One frame of the focus: true while it goes on; whole, the half-size maps go.
function focusStep(held: Held, maps: Maps, { delta, still }: Frame): boolean {
  const full = maps.fullCame;
  if (full === undefined || held.focus === undefined) return false;
  held.focus = still ? 1 : Math.min(1, held.focus + Math.min(delta, LONGEST_S) / FOCUS_S);
  held.drawn.setEarthMaps(full, eased(held.focus));
  if (held.focus < 1) return true;
  delete held.focus;
  maps.settleFull();
  return false;
}

/** One frame's step of `held`'s upgrade to the Earth's full maps (none yet: nothing to do). True while they come into focus, which keeps
 * the scene drawing. */
export function upgradeStep(held: Held, { maps, renderer }: Device, frame: Frame): boolean {
  if (held.focus !== undefined) return focusStep(held, maps, frame);
  const full = maps.fullEarth();
  if (full === undefined || held.upgraded || frame.busy) return false;
  held.pending ??= [full.clouds, full.night, full.day];
  const next = held.pending.pop();
  if (next !== undefined) {
    renderer.initTexture(next);
    return false;
  }
  held.upgraded = true;
  // An Earth made from the full maps has nothing to bring into focus.
  if (mapsOf(held.drawn.group).includes(full.day)) {
    held.drawn.setEarthMaps(full);
    maps.settleFull();
    return false;
  }
  // The frame they are swapped in shows the half-size maps alone.
  held.focus = 0;
  return focusStep(held, maps, { ...frame, delta: 0 });
}

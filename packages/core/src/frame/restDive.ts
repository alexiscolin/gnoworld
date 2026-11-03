// The way down to the view at rest reads in depth too (the chief, 2026-11-03, after Alexis's not-a-planetarium rule): seen from farther
// back along the eye's line, bodies on either side of the Earth at unequal gaps even them out, and 7d7's dive passes there. A view whose
// dive stands three of its bodies, the Earth among them, on a line at like gaps for longer than a tenth of a second is refused.
import { EARTH_PLACE } from "../cosmos/system.ts";
import { BODY_PIXELS } from "../lod/ladder.ts";
import { orbitTime } from "../space/drift.ts";
import { evenRow } from "./composition.ts";
import { DIVE, diveAt } from "./dive.ts";
import { spotsOf, type Card } from "./restCards.ts";
import { cameraTowards, looksFrom, type Camera, type Close } from "./restLook.ts";

// At 60 frames a second, a row on more than six frames running has lasted longer than a tenth of a second: seven frames running hold a
// seventh frame, so every seventh is looked at, and a row there is followed frame by frame.
const PER_SECOND = 60;
const FRAMES_MOST = 6;
const FRAMES = Math.round(DIVE.seconds * PER_SECOND);

/** Whether the dive down to `camera`'s eye stands three of the drawn bodies on a line at like gaps for longer than a tenth of a second, on
 * either screen; the postcards turn on the way. */
export function rowOnTheWayDown(camera: Camera, cards: readonly Card[], close: Close | undefined): boolean {
  const out = { x: 0, y: 0, z: 0 };
  const rowAt = (frame: number) => {
    diveAt(camera.eye, frame / FRAMES, out);
    const seconds = orbitTime(frame / PER_SECOND);
    return looksFrom(cameraTowards({ ...out }, EARTH_PLACE)).some((look) =>
      evenRow([look.earth, ...spotsOf(look, cards, { close, seconds }).filter(({ radius }) => radius >= BODY_PIXELS)]),
    );
  };
  for (let frame = FRAMES_MOST + 1; frame < FRAMES; frame += FRAMES_MOST + 1) {
    if (!rowAt(frame)) continue;
    let [first, last] = [frame, frame];
    while (first > 1 && rowAt(first - 1)) first -= 1;
    while (last < FRAMES - 1 && rowAt(last + 1)) last += 1;
    if (last - first + 1 > FRAMES_MOST) return true;
  }
  return false;
}

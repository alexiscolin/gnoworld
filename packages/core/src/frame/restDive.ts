// The way down to the view at rest reads in depth too (the chief, 2026-11-03, after Alexis's not-a-planetarium rule): seen from farther
// back along the eye's line, bodies on either side of the Earth at unequal gaps even them out, and 7d7's dive passes there. A view whose
// dive stands three of its bodies, the Earth among them, on a line at like gaps for longer than a tenth of a second is refused.
import { EARTH_PLACE, EARTH_RADIUS, type Orbiter, type StarSystem } from "../cosmos/system.ts";
import { BODY_PIXELS } from "../lod/ladder.ts";
import type { Point } from "../space/cell.ts";
import { orbitTime } from "../space/drift.ts";
import { evenRow } from "./composition.ts";
import { DIVE, diveAt } from "./dive.ts";
import type { Card } from "./restCards.ts";
import {
  cameraFrom,
  dot,
  focalOf,
  minus,
  placeOf,
  REST_SCREENS,
  type Camera,
  type Close,
  type Seen,
} from "./restLook.ts";

// At 60 frames a second, a row on more than six frames running has lasted longer than a tenth of a second: seven frames running hold a
// seventh frame, so every seventh is looked at, and a row there is followed frame by frame.
const PER_SECOND = 60;
const FRAMES_MOST = 6;
const FRAMES = Math.round(DIVE.seconds * PER_SECOND);

// A body's centre, size and distance as `camera` sees it, on a screen `height` high and of no width: the screens share a height, and a row
// at like gaps is one wherever the screen's middle stands. Its box is its round outline's, which the row does not read.
function seenFrom({ eye, ahead, right, up }: Camera, height: number, [at, radius]: readonly [Point, number]): Seen {
  const from = minus(at, eye);
  const depth = dot(from, ahead);
  const scale = focalOf(height) / Math.max(depth, 1e-9);
  const [x, y, size] = [dot(from, right) * scale, height / 2 - dot(from, up) * scale, radius * scale];
  const away = Math.hypot(from.x, from.y, from.z);
  return { x, y, radius: size, depth, away, left: x - size, right: x + size, top: y - size, bottom: y + size };
}

/** Whether the dive down to `camera`'s eye stands three of the drawn bodies on a line at like gaps for longer than a tenth of a second, on
 * either screen; the postcards turn on the way. */
export function rowOnTheWayDown(camera: Camera, cards: readonly Card[], close: Close | undefined): boolean {
  const out = { x: 0, y: 0, z: 0 };
  const bodies: (readonly [StarSystem, Orbiter, boolean])[] = cards.flatMap(({ system, worlds }) =>
    worlds.map((world) => [system, world, false] as const),
  );
  if (close !== undefined) bodies.push([close.held.system, close.world, true]);
  const rowAt = (frame: number) => {
    diveAt(camera.eye, frame / FRAMES, out);
    const [eye, seconds, height] = [cameraFrom({ ...out }), orbitTime(frame / PER_SECOND), REST_SCREENS[0].height];
    const earth = seenFrom(eye, height, [EARTH_PLACE, EARTH_RADIUS]);
    const seen = bodies
      .map(([system, world, still]) =>
        seenFrom(eye, height, [placeOf(system, world, still ? 0 : seconds), world.radius]),
      )
      .filter(({ depth, radius }) => depth > 0 && radius >= BODY_PIXELS);
    return REST_SCREENS.some(({ width }) => {
      const shown = seen.filter(
        ({ left, right, top, bottom }) => right > -width / 2 && left < width / 2 && bottom > 0 && top < height,
      );
      return evenRow([earth, ...shown]);
    });
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

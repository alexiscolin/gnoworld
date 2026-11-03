// A system's dynamic view's framing (part 7v), each screen it is judged on: its nearest world cut by the frame and the largest, or whole as
// the others, the others whole under the header, all off the star's heart and in no crowd, pile or row at rest. Apart from the search
// for the angle (arrival.ts), which reads it.
import { composed } from "./composition.ts";
import { drawnOf, type Postcard } from "./postcard.ts";
import type { Point } from "../space/cell.ts";
import { ARRIVAL_LEAN } from "../space/drift.ts";
import { CENTRE, toMap } from "./disc.ts";
import {
  along,
  CARD_ZONE,
  cameraTowards,
  looksFrom,
  placeOf,
  STAR_HEART,
  type Camera,
  type Look,
  type Seen,
} from "./restLook.ts";

// The near world shows this share of itself each way at rest and swayed, 1.5 times every other's size or more at rest (the depth's own,
// depth.ts) and 1.35 through the sway, where of Onyx's six systems that stand six worlds none held 1.5 at every corner (F4468); a tenth of
// the height across at the least, for worlds under their crowd's cap stand smaller than at it (F4468), half the height at most.
const [SHOWN_AT_REST, SHOWN_SWAYED] = [0.3, 0.25];
const [NEAR_OVER, NEAR_SWAYED] = [1.5, 1.35];
const [NEAR_LEAST, NEAR_MOST] = [0.1, 0.5];
const [MARGIN, HEADER] = [24, 0.09];

/** A system as a view draws it: its plane, its worlds and their shares of their size. */
export type Card = Pick<Postcard, "system" | "worlds" | "depth">;

/** A system's worlds as one camera sees them, at their drawn size: the nearest first; and its star. */
export function seenOf(look: Look, card: Card): { star: Seen; worlds: Seen[] } {
  const worlds = drawnOf(card).map((world) => look.seen(placeOf(card.system, world, 0), world.radius));
  return { star: look.seen(card.system.place), worlds: worlds.sort((a, b) => a.away - b.away) };
}

// The least share of a body there shown each way in the frame, over `foot` of its height; none in front of the eye or over the header.
function leastShown({ width, height }: Look, at: Seen, foot: number): number {
  const shown = (Math.min(at.right, width) - Math.max(at.left, 0)) / (at.right - at.left);
  const up = (Math.min(at.bottom, foot * height) - at.top) / (at.bottom - at.top);
  return at.depth > 0 && at.top >= HEADER * height ? Math.min(shown, up) : -Infinity;
}

// Whether a body there is cut by the frame's sides or its foot, never its head, which the header holds: `least` of it shown each way.
const cutByFrame = (look: Look, at: Seen, least: number) =>
  (at.left < 0 || at.right > look.width || at.bottom > look.height) && leastShown(look, at, 1) >= least;

// A mouse's lean on the map: the eight edges of the stage's across and up as shares of a dynamic view's lean, each way, then the corners.
export const LEANS = [
  [1, 0],
  [-1, 0],
  [0, 1],
  [0, -1],
  [1, 1],
  [1, -1],
  [-1, 1],
  [-1, -1],
] as const;

/** `camera` leaned shares of a dynamic view's lean across and up, turned back to `at`. */
export function leaned(camera: Camera, [across, up]: readonly [number, number], at: Point): Camera {
  const by: Point = { x: 0, y: 0, z: 0 };
  toMap({ x: CENTRE.x + across * ARRIVAL_LEAN, y: CENTRE.y + up * ARRIVAL_LEAN, z: CENTRE.z }, by);
  return cameraTowards(along(camera.eye, by, 1), at);
}

/** How far a mouse may lean the eye across and up the stage, as shares of the dynamic view's lean. */
export interface LeanRoom {
  readonly right: number;
  readonly left: number;
  readonly up: number;
  readonly down: number;
}

/** How far a mouse may lean the eye from `camera` each way, keeping the nearest world of `card` in the frame's room: the whole lean, else a
 * fifth less at a time, none under a fifth; each way on its own, then each corner both its ways less till it holds. */
export function roomOf(camera: Camera, card: Card): LeanRoom {
  const room = { right: 1, left: 1, up: 1, down: 1 };
  // The nearest keeps a seventh of itself each way under the header and over the ticker, 34 px of 1,080 (gnoswap's pool, cut by the foot,
  // keeps a third at rest), on each screen: a mouse's lean moved it under the ticker (F4468).
  const kept = (across: number, up: number) =>
    looksFrom(leaned(camera, [across, up], card.system.place)).every((look) => {
      const [near] = seenOf(look, card).worlds;
      return near === undefined || leastShown(look, near, 1 - 34 / 1080) >= 0.15;
    });
  for (const [across, up] of LEANS) {
    const [x, y] = [across < 0 ? "left" : "right", up < 0 ? "down" : "up"] as const;
    let share = 1;
    while (share > 0 && !kept(across * room[x] * share, up * room[y] * share)) share = share > 0.2 ? share * 0.8 : 0;
    room[x] *= across === 0 ? 1 : share;
    room[y] *= up === 0 ? 1 : share;
  }
  return room;
}

const offHeart = (spot: Seen, star: Seen) => Math.hypot(spot.x - star.x, spot.y - star.y) - spot.radius >= STAR_HEART;
// Off the system's card at the top left, which a ringed giant stood over in g1magld5's view (the design review's second pass, F4472).
const offCard = (look: Look, spot: Seen) =>
  spot.left >= CARD_ZONE.right * look.width || spot.top >= CARD_ZONE.bottom * look.height;

/** On one screen: the nearest world cut by the frame, half the height across at most, 1.5 times every other's size or more, or where `cut`
 * is not asked whole as the others; off the star's heart; the others whole under the header and off it; at rest, in no crowd, pile or row
 * (7d6's rules). */
export function frames(look: Look, card: Card, how: { atRest: boolean; cut: boolean }): boolean {
  const { star, worlds } = seenOf(look, card);
  const [near, ...others] = worlds;
  if (near === undefined || !leads(look, [near, others], how)) return false;
  if (!offHeart(near, star) || !others.every((spot) => look.whole(spot, MARGIN) && offHeart(spot, star))) return false;
  if (!worlds.every((spot) => offCard(look, spot))) return false;
  const { atRest } = how;
  const frame = { deep: false, lights: [star], width: look.width, height: look.height };
  return !atRest || others.length === 0 || composed(others, near, frame);
}

// The nearest world as the view asks it: cut by the frame and the largest, or whole as the others.
function leads(
  look: Look,
  [near, others]: readonly [Seen, readonly Seen[]],
  { atRest, cut }: { atRest: boolean; cut: boolean },
) {
  if (!cut) return look.whole(near, MARGIN);
  return (
    cutByFrame(look, near, atRest ? SHOWN_AT_REST : SHOWN_SWAYED) &&
    near.radius >= NEAR_LEAST * look.height &&
    near.radius <= NEAR_MOST * look.height &&
    others.every(({ radius }) => near.radius >= (atRest ? NEAR_OVER : NEAR_SWAYED) * radius)
  );
}

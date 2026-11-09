// A system's dynamic view's framing (part 7v), each screen it is judged on: its nearest world cut by the frame and the largest, or whole as
// the others, the others whole under the header, all off the star's heart and in no crowd, pile or row. Apart from the search
// for the angle (arrival.ts), which reads it.
import { composed, upright } from "./composition.ts";
import { drawnOf, type Postcard } from "./postcard.ts";
import { BANDS } from "./bands.ts";
import { CARD_ZONE, placeOf, STAR_HEART, type Look, type Seen } from "./restLook.ts";

// The near world shows this share of itself each way, and stands 1.5 times every other's size or more (the depth's own, depth.ts); a tenth
// of the height across at the least, for worlds under their crowd's cap stand smaller than at it (F4468), half the height at most.
const SHOWN = 0.3;
const NEAR_OVER = 1.5;
const [NEAR_LEAST, NEAR_MOST] = [0.1, 0.5];
const MARGIN = 24;

/** A system as a view draws it: its plane, its worlds and their shares of their size. */
export type Card = Pick<Postcard, "system" | "worlds" | "depth">;

/** A system's worlds as one camera sees them, at their drawn size: the nearest first; and its star. */
export function seenOf(look: Look, card: Card): { star: Seen; worlds: Seen[] } {
  const worlds = drawnOf(card).map((world) => look.seen(placeOf(card.system, world, 0), world.radius));
  return { star: look.seen(card.system.place), worlds: worlds.sort((a, b) => a.away - b.away) };
}

// The least share of a body there shown each way in the frame; none in front of the eye or over the header.
function leastShown({ width, height }: Look, at: Seen): number {
  const shown = (Math.min(at.right, width) - Math.max(at.left, 0)) / (at.right - at.left);
  const up = (Math.min(at.bottom, height) - at.top) / (at.bottom - at.top);
  return at.depth > 0 && at.top >= BANDS.header * height ? Math.min(shown, up) : -Infinity;
}

// Whether a body there is cut by the frame's sides or its foot, never its head, which the header holds: `least` of it shown each way.
const cutByFrame = (look: Look, at: Seen, least: number) =>
  (at.left < 0 || at.right > look.width || at.bottom > look.height) && leastShown(look, at) >= least;

// Three worlds or more whose spread across stands within 40 degrees of their spread up, a column: g1magld5's blog, streak and agents on one
// side of their star (the design review's second pass, F4468), as the home's columns.
const columned = (worlds: readonly Seen[]) => {
  const [across, up] = [worlds.map(({ x }) => x), worlds.map(({ y }) => y)];
  const corner = (pick: (...values: number[]) => number) => ({ x: pick(...across), y: pick(...up) });
  return worlds.length >= 3 && upright(corner(Math.min), corner(Math.max));
};

const offHeart = (spot: Seen, star: Seen) => Math.hypot(spot.x - star.x, spot.y - star.y) - spot.radius >= STAR_HEART;
// Off the system's card at the top left, which a ringed giant stood over in g1magld5's view (the design review's second pass, F4472).
const offCard = (look: Look, spot: Seen) =>
  spot.left >= CARD_ZONE.right * look.width || spot.top >= CARD_ZONE.bottom * look.height;

/** On one screen: the nearest world cut by the frame, half the height across at most, 1.5 times every other's size or more, or where `cut`
 * is not asked whole as the others; off the star's heart; the others whole under the header and off it; in no crowd, pile or row (7d6's
 * rules). */
export function frames(look: Look, card: Card, cut: boolean): boolean {
  const { star, worlds } = seenOf(look, card);
  const [near, ...others] = worlds;
  if (near === undefined || !leads(look, [near, others], cut)) return false;
  if (!offHeart(near, star) || !others.every((spot) => look.whole(spot, MARGIN) && offHeart(spot, star))) return false;
  if (!worlds.every((spot) => offCard(look, spot))) return false;
  const frame = { deep: false, lights: [star], width: look.width, height: look.height };
  return !columned(worlds) && (others.length === 0 || composed(others, near, frame));
}

// The nearest world as the view asks it: cut by the frame and the largest, or whole as the others.
function leads(look: Look, [near, others]: readonly [Seen, readonly Seen[]], cut: boolean) {
  if (!cut) return look.whole(near, MARGIN);
  return (
    cutByFrame(look, near, SHOWN) &&
    near.radius >= NEAR_LEAST * look.height &&
    near.radius <= NEAR_MOST * look.height &&
    others.every(({ radius }) => near.radius >= NEAR_OVER * radius)
  );
}

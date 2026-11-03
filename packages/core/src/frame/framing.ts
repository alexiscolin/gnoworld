// A system's dynamic view's framing (part 7v), each screen it is judged on: its nearest world cut by the frame and the largest, or whole as
// the others, the others whole under the header, all off the star's heart and in no crowd, pile or row at rest. Apart from the search
// for the angle (arrival.ts), which reads it.
import { composed } from "./composition.ts";
import { drawnOf, type Postcard } from "./postcard.ts";
import { CARD_ZONE, placeOf, STAR_HEART, type Look, type Seen } from "./restLook.ts";

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

// Whether a body there is cut by the frame's sides or its foot, never its head, which the header holds: `least` of it shown each way.
function cutByFrame(look: Look, at: Seen, least: number): boolean {
  const { width, height } = look;
  const [wide, high] = [at.right - at.left, at.bottom - at.top];
  const shown = (Math.min(at.right, width) - Math.max(at.left, 0)) / wide;
  const up = (Math.min(at.bottom, height) - at.top) / high;
  const cut = at.left < 0 || at.right > width || at.bottom > height;
  return at.depth > 0 && cut && at.top >= HEADER * height && shown >= least && up >= least;
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

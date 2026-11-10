// The page's circle on space (D401): its planet slides to it with the move itself; the home's first screen frames the Earth close in it
// (D459); and a framing that changes at rest (a window across the dock's width, the quality set low, the home left for its system's page)
// flies the camera to it, telling the page nothing (D462). Seen from above, the framing is the Map's.
import type { Space } from "./scene.ts";
import { middleOf, shiftOf, type Circle } from "./goals.ts";
import type { Planet, Universe, Vec } from "./layout.ts";
import type { Place } from "./place.ts";
import { boosts } from "./boosts.ts";
import { HOME_BOOST } from "./vista.ts";
import type { Goal } from "./rig/rig.ts";

/** Whether the home shows its first screen (D459): the Earth close, in the circle its page lays out, not its system. */
export const arrivalOf = ({ place, plan, circle }: Pick<Space, "place" | "plan" | "circle">): boolean =>
  place?.kind === "home" && !plan && circle?.close === true;

/** The page's planet slides to its circle, or the view back to its middle, with the move itself: done as it lands. */
export function slideFor(space: Space, place: Place): void {
  const framed = place.kind === "world" || arrivalOf(space);
  const shift = framed ? shiftOf(space.circle ?? middleOf(space.see.screen)) : undefined;
  space.rig.lens(shift, space.options.still() || !space.rig.flying);
}

/** Holds the page's `circle`; where its framing turned at rest, flies to `again`, the place's goal, which tells the page nothing. */
export function holdCircle(
  space: Space,
  circle: Circle | undefined,
  again: (place: Place, universe: Universe) => Goal | undefined,
): void {
  const turned = (circle?.close === true) !== (space.circle?.close === true);
  space.circle = circle;
  const { place, rig, universe } = space;
  if (place === undefined || universe === undefined) return;
  const goal = turned && !rig.flying && !space.plan ? again(place, universe) : undefined;
  if (goal !== undefined) rig[space.seen ? "fly" : "jump"](goal);
  // A page's planet keeps to its circle as the page lays it out; during a flight the slide that rides it heads for the new one.
  slideFor(space, place);
}

// The page's planet alone once the page comes, and the home's Earth framed close (D481): the others shrink away, and come back as it
// leaves; near the camera they would stand stretched at the frame's edge.
export const aloneOf = (space: Space): Planet | undefined =>
  space.arrival ? space.universe?.earth : space.neared ? space.kept : undefined;

// raw: on the home only the worlds this large on screen, in pixels, leave; the far ones stay as points behind the Earth, for depth (D499)
const LEAVE_PX = 220;

/** How large on screen the others must stand to leave: on the home a few pixels, elsewhere all of them (0). */
const soloPxOf = (space: Space, alone: Planet | undefined): number =>
  space.arrival && alone !== undefined ? LEAVE_PX : 0;

// raw: a flight shorter than this many radii of its planet is a hop (the home's Earth to its page)
const HOP = 4;

/** Whether a flight of the eye from `from` to `eye`, ending at `planet`, is long enough to end in the page's scan; none for a hop (D517). */
export const scans = (planet: Planet, from: Vec, eye: Vec): boolean =>
  !(Math.hypot(eye.x - from.x, eye.y - from.y, eye.z - from.z) < planet.radius * HOP);

/** The home's first screen in the frame's uniforms: which worlds leave (D499) and how much larger its featured worlds are drawn (D541):
 * grown in by the flight that lands there, whole once landed, so nothing grows at rest (D555); eased `share` of the way out as it is left. */
export function homeFrame(space: Space, alone: Planet | undefined, share: number): void {
  const { uSoloPx, uBoost } = space.stage.frame;
  uSoloPx.value = soloPxOf(space, alone);
  const { rig, arrival } = space;
  if (arrival) uBoost.value = Math.max(uBoost.value, 1 + (HOME_BOOST - 1) * rig.along);
  else uBoost.value += (1 - uBoost.value) * share;
  boosts.gate = uBoost.value - 1;
}

/** Whether this is the first arrival of a scene that came in from black (a page opened from its URL): asked once per arrival, it marks the canvas. */
export function firstArrival({ dataset }: HTMLCanvasElement): boolean {
  const first = dataset["first"] !== undefined && dataset["scanned"] === undefined;
  dataset["scanned"] = "";
  return first;
}

// What the view at rest's bodies must read as on the screen (slice 7d6, Alexis's "trop collés et en amas" and "de la profondeur"):
// no group denser than frame 4's, no body on another, no line of bodies, and, with a close world, sizes and distances far apart.
import type { Seen } from "./restLook.ts";

// Frame 4's densest group, measured by the chief at 1728 by 1080: four bodies in about 200 by 120 pixels.
const GROUP = { across: 200, up: 120, most: 4 };
// The spread across the best line through what stands on the screen against the spread along it, at the least, for three or more; a
// view with a close world and a lit Earth stands low over the disc: a tenth (the chief, 2026-11-02). A row that recedes, its sizes
// falling `RECEDES` times or more from near to far, is depth, not a row (Alexis's references).
const ACROSS_LINE = 0.2;
const ACROSS_LOW = 0.1;
const LINE_LEAST = 3;
// Three bodies, or three glowing stars, a tenth or less off a line read as laid out for show when their two gaps are alike within this
// share; at unequal gaps they read as depth (the chief, 2026-11-03). A mix is not judged: a world, its star and another stand so as they turn.
const EVEN = 0.15;
const RECEDES = 2;
const SIZES_APART = 4;
const DISTANCES_APART = 2.5;

/** A round thing on a screen: its centre and radius, in pixels. */
interface Spot {
  readonly x: number;
  readonly y: number;
  readonly radius: number;
}

/** What a view's composition is judged on: whether it holds a close world, the glowing stars' places, and the screen. */
export interface Frame {
  readonly deep: boolean;
  readonly lights: readonly Spot[];
  readonly width: number;
  readonly height: number;
}

const ratio = (values: readonly number[]) => Math.max(...values) / Math.min(...values);

/** How far `spots` stand off a line: the spread across the best line through them over the spread along it, 0 for a line. */
export function offLine(spots: readonly { readonly x: number; readonly y: number }[]): number {
  const count = spots.length;
  const [x0, y0] = [spots.reduce((sum, { x }) => sum + x, 0) / count, spots.reduce((sum, { y }) => sum + y, 0) / count];
  let [xx, xy, yy] = [0, 0, 0];
  for (const { x, y } of spots) [xx, xy, yy] = [xx + (x - x0) ** 2, xy + (x - x0) * (y - y0), yy + (y - y0) ** 2];
  const [middle, reach] = [(xx + yy) / 2, Math.hypot((xx - yy) / 2, xy)];
  return middle + reach === 0 ? 0 : Math.sqrt((middle - reach) / (middle + reach));
}

// Any box of the group's size: one whose left edge stands at a body's centre and top edge at a body's, which tries every box that holds a
// different set. ponytail: n³ on the dozen spots a view draws at most.
const crowded = (spots: readonly Seen[]) =>
  spots.some((left) =>
    spots.some(
      (top) =>
        spots.filter(({ x, y }) => x >= left.x && x <= left.x + GROUP.across && y >= top.y && y <= top.y + GROUP.up)
          .length > GROUP.most,
    ),
  );

// Two bodies at a like distance keep a third of the smaller one's width between them; one this much nearer may cover a farther one, by half
// of it at most: that is depth (the chief, 2026-11-02, after Alexis).
const LIKE = 1.5;
const AIR = 2 / 3;
const COVERED_MOST = 0.5;

/** The share of the farther round spot's disc the nearer covers. */
export function coveredShare(near: Spot, far: Spot): number {
  const [apart, a, b] = [Math.hypot(near.x - far.x, near.y - far.y), near.radius, far.radius];
  if (apart >= a + b) return 0;
  if (apart <= Math.abs(a - b)) return a >= b ? 1 : (a * a) / (b * b);
  const alpha = Math.acos((apart * apart + a * a - b * b) / (2 * apart * a));
  const beta = Math.acos((apart * apart + b * b - a * a) / (2 * apart * b));
  return (a * a * (alpha - Math.sin(2 * alpha) / 2) + b * b * (beta - Math.sin(2 * beta) / 2)) / (Math.PI * b * b);
}

const meet = (one: Seen, other: Seen) => {
  const [near, far] = one.away <= other.away ? [one, other] : [other, one];
  if (far.away / near.away >= LIKE) return coveredShare(near, far) > COVERED_MOST;
  return (
    Math.hypot(near.x - far.x, near.y - far.y) - near.radius - far.radius < AIR * Math.min(near.radius, far.radius)
  );
};

const piled = (spots: readonly Seen[]) =>
  spots.some((one, at) => spots.slice(at + 1).some((other) => meet(one, other)));

// Whether `bodies` recede along the best line through them: their distances rising one way, the nearest one's size `RECEDES` times the
// farthest one's or more.
function recedes(bodies: readonly Seen[]): boolean {
  const count = bodies.length;
  const [x0, y0] = [
    bodies.reduce((sum, { x }) => sum + x, 0) / count,
    bodies.reduce((sum, { y }) => sum + y, 0) / count,
  ];
  let [xx, xy, yy] = [0, 0, 0];
  for (const { x, y } of bodies) [xx, xy, yy] = [xx + (x - x0) ** 2, xy + (x - x0) * (y - y0), yy + (y - y0) ** 2];
  const angle = Math.atan2(2 * xy, xx - yy) / 2;
  const along = [...bodies].sort((a, b) => (a.x - b.x) * Math.cos(angle) + (a.y - b.y) * Math.sin(angle));
  const rising = along.every((body, at) => at === 0 || body.away > (along[at - 1]?.away ?? Infinity));
  const falling = along.every((body, at) => at === 0 || body.away < (along[at - 1]?.away ?? -Infinity));
  const byAway = [...bodies].sort((a, b) => a.away - b.away);
  const [nearest, farthest] = [byAway[0], byAway.at(-1)];
  return (
    (rising || falling) &&
    nearest !== undefined &&
    farthest !== undefined &&
    nearest.radius >= RECEDES * farthest.radius
  );
}

const apart = (one: Spot, other: Spot) => Math.hypot(one.x - other.x, one.y - other.y);

// Three marks near a line at like gaps, unless they are bodies that recede: of three nearly on a line, the two gaps are the two shorter of
// their distances, compared first as the cheaper test.
function evenly(three: readonly (Spot | Seen)[]): boolean {
  const [one, two, last] = three;
  if (one === undefined || two === undefined || last === undefined) return false;
  const [short = 0, long = 0] = [apart(one, two), apart(two, last), apart(one, last)].sort((a, b) => a - b);
  if (long - short > EVEN * long || offLine(three) > ACROSS_LOW) return false;
  const bodies = three.filter((mark): mark is Seen => "away" in mark);
  return bodies.length < three.length || !recedes(bodies);
}

/** Whether three of `marks` stand near a line at like gaps, bodies that recede apart: laid out for show. ponytail: n³ on the dozen marks
 * a view draws at most. */
export const evenRow = (marks: readonly (Spot | Seen)[]): boolean =>
  marks.some((one, a) =>
    marks.slice(a + 1).some((two, b) => marks.slice(a + b + 2).some((three) => evenly([one, two, three]))),
  );

// What stands on the screen reads as a row: three or more of the bodies' centres on it and the glowing stars near a line, not receding;
// or three bodies, or three stars, near one at like gaps.
function aRow(all: readonly Seen[], { deep, lights, width, height }: Frame): boolean {
  const shown = all.filter(({ x, y }) => x >= 0 && x <= width && y >= 0 && y <= height);
  const stars = lights.filter(({ x, y }) => x >= 0 && x <= width && y >= 0 && y <= height);
  const marks = [...shown, ...stars];
  const lined = marks.length >= LINE_LEAST && offLine(marks) <= (deep ? ACROSS_LOW : ACROSS_LINE) && !recedes(shown);
  return lined || evenRow(shown) || evenRow(stars);
}

// Two neighbours stand at one height under a tenth of the screen's height apart and under 40 degrees off level (the chief's reading of
// Alexis's rule, 2026-11-03: a far postcard's bodies stand nearer than a tenth of the height, and read apart by their slant).
const ONE_HEIGHT = 0.1;
const LEVEL = Math.tan((40 * Math.PI) / 180);

/** Whether two places stand at one height on a screen `height` pixels high. */
export const atOneHeight = (
  one: { x: number; y: number },
  other: { x: number; y: number },
  height: number,
): boolean => {
  const up = Math.abs(one.y - other.y);
  return up < ONE_HEIGHT * height && up < LEVEL * Math.abs(one.x - other.x);
};

/** Whether the bodies on screen, `spots`, and the Earth read as the view must, judged in `frame`: spread, apart, in no row that does not
 * recede, and deep with a close world. */
export function composed(spots: readonly Seen[], earth: Seen, frame: Frame): boolean {
  const all = [earth, ...spots];
  if (crowded(all) || piled(all) || aRow(all, frame)) return false;
  return (
    !frame.deep ||
    (ratio(all.map(({ radius }) => radius)) >= SIZES_APART && ratio(all.map(({ away }) => away)) >= DISTANCES_APART)
  );
}

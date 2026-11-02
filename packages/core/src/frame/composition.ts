// What the view at rest's bodies must read as on the screen (slice 7d6, Alexis's "trop collés et en amas" and "de la profondeur"):
// no group denser than frame 4's, no body on another, no line of bodies, and, with a close world, sizes and distances far apart.
import type { Seen } from "./restLook.ts";

// Frame 4's densest group, measured by the chief at 1728 by 1080: four bodies in about 200 by 120 pixels.
const GROUP = { across: 200, up: 120, most: 4 };
// The spread across the best line through the bodies against the spread along it, at the least, for four or more: three make a triangle.
const ACROSS_LINE = 0.2;
// A view with a close world and a lit Earth stands low over the disc: a tenth (the chief, 2026-11-02; Onyx's reads 0.11).
const ACROSS_LOW = 0.1;
const LINE_LEAST = 4;
const SIZES_APART = 4;
const DISTANCES_APART = 2.5;

/** A round thing on a screen: its centre and radius, in pixels. */
interface Spot {
  readonly x: number;
  readonly y: number;
  readonly radius: number;
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

/** Whether the bodies on screen, `spots`, and the Earth read as the view must: spread, apart, off a line, and deep with a close world. */
export function composed(spots: readonly Seen[], earth: Seen, deep: boolean): boolean {
  const all = [earth, ...spots];
  if (crowded(all) || piled(all) || (all.length >= LINE_LEAST && offLine(all) <= (deep ? ACROSS_LOW : ACROSS_LINE)))
    return false;
  return (
    !deep ||
    (ratio(all.map(({ radius }) => radius)) >= SIZES_APART && ratio(all.map(({ away }) => away)) >= DISTANCES_APART)
  );
}

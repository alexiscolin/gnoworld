// A ball's true outline on a screen (7d6's review): seen off the view's axis, a ball draws as an oval stretched outward, not as the circle
// its centre and its radius over its depth give. Along each screen axis its extremes are where the two lines from the eye touch it.

/** A ball's outline on a screen, in pixels: its left, right, top and bottom edges. */
export interface Outline {
  readonly left: number;
  readonly right: number;
  readonly top: number;
  readonly bottom: number;
}

/** Where a ball sits from the eye, in the camera's axes: across, up, along the view, and its radius. */
export interface Ball {
  readonly across: number;
  readonly up: number;
  readonly depth: number;
  readonly radius: number;
}

// The slopes of the two lines from the eye that touch a ball, in the plane of one screen axis and the view's: none when the eye is in it.
function slopes(along: number, depth: number, radius: number): readonly [number, number] {
  const under = depth * depth - radius * radius;
  if (under <= 0) return [-Infinity, Infinity];
  const root = radius * Math.sqrt(along * along + under);
  return [(along * depth - root) / under, (along * depth + root) / under];
}

/** `ball`'s outline on a screen `width` by `height` pixels whose lens is `focal` pixels. */
export function outlineOf(
  { across, up, depth, radius }: Ball,
  focal: number,
  [width, height]: readonly [number, number],
): Outline {
  const [left, right] = slopes(across, depth, radius);
  const [low, high] = slopes(up, depth, radius);
  return {
    left: width / 2 + focal * left,
    right: width / 2 + focal * right,
    top: height / 2 - focal * high,
    bottom: height / 2 - focal * low,
  };
}

// The clips and fades the chat's move draws, baked into keyframes: the browser runs them on a plain linear timing, so any GSAP curve works
// on every browser the build targets (a CSS linear() easing needs Chrome 113 and Safari 17.2).

/** A box in the window (a DOMRect is one). */
export interface Box {
  readonly left: number;
  readonly top: number;
  readonly right: number;
  readonly bottom: number;
}

/** How far each edge of a clip stands in from its box's edge. */
export interface Insets {
  readonly top: number;
  readonly right: number;
  readonly bottom: number;
  readonly left: number;
}

const STEPS = 48;

/** The clip with these `insets`, its corners `round`. */
export const insetClip = ({ top, right, bottom, left }: Insets, round: number): string =>
  `inset(${String(top)}px ${String(right)}px ${String(bottom)}px ${String(left)}px round ${String(round)}px)`;

/** The clip of `box` that shows `within` alone, its corners `round`. */
export const clipOf = (box: Box, within: Box, round: number): string =>
  insetClip(
    {
      top: within.top - box.top,
      right: box.right - within.right,
      bottom: box.bottom - within.bottom,
      left: within.left - box.left,
    },
    round,
  );

/** The insets of a computed `inset(... round ...)` clip; none for any other value (no clip). */
export function parseInset(clip: string): Insets | undefined {
  const sides = /^inset\(\s*(\S+)px\s+(\S+)px\s+(\S+)px\s+(\S+)px/.exec(clip)?.slice(1, 5).map(Number);
  const [top, right, bottom, left] = sides ?? [];
  return top === undefined || right === undefined || bottom === undefined || left === undefined
    ? undefined
    : { top, right, bottom, left };
}

/** `value` at each step of `curve`, as keyframes spread over the first `span` of the timing. */
function bake<T extends object>(curve: (t: number) => number, value: (k: number) => T, span = 1) {
  return Array.from({ length: STEPS + 1 }, (_, i) => ({ offset: (i / STEPS) * span, ...value(curve(i / STEPS)) }));
}

/** The clips a screen of `box` grows through out of `from`: the browser composites a clip only between equal radii, so it ends a radius
 * past the box on every side, where the corners are out of sight. */
export function growClips(box: Box, from: Box, round: number): [string, string] {
  const past = { left: box.left - round, top: box.top - round, right: box.right + round, bottom: box.bottom + round };
  return [clipOf(box, from, round), clipOf(box, past, round)];
}

/** The grow as keyframes: the clip's edges follow `curve` (0 to 1 over `grow` seconds) to the box's own edge, then a `tail` carries the clip
 * past it where the rounded corners go out of sight. One radius throughout, so the browser still composites it. */
export function growFrames(
  box: Box,
  from: Box,
  { round, curve, grow, tail }: { round: number; curve: (t: number) => number; grow: number; tail: number },
): { offset: number; clipPath: string }[] {
  const frames = bake(
    curve,
    (k) => {
      const at = (a: number, b: number) => a + (b - a) * k;
      const within = {
        left: at(from.left, box.left),
        top: at(from.top, box.top),
        right: at(from.right, box.right),
        bottom: at(from.bottom, box.bottom),
      };
      return { clipPath: clipOf(box, within, round) };
    },
    grow / (grow + tail),
  );
  return [...frames, { offset: 1, clipPath: growClips(box, from, round)[1] }];
}

/** The shrink as keyframes: the clip's insets go from `start` (the screen as it stands) to the dock's `to` on `curve`, one radius. */
export function shrinkFrames(
  start: Insets,
  to: Insets,
  { round, curve }: { round: number; curve: (t: number) => number },
): { offset: number; clipPath: string }[] {
  return bake(curve, (k) => {
    const at = (a: number, b: number) => a + (b - a) * k;
    return {
      clipPath: insetClip(
        {
          top: at(start.top, to.top),
          right: at(start.right, to.right),
          bottom: at(start.bottom, to.bottom),
          left: at(start.left, to.left),
        },
        round,
      ),
    };
  });
}

/** An opacity going from `from` to `to` on `curve`. */
export const fadeFrames = (
  curve: (t: number) => number,
  from: number,
  to: number,
): { offset: number; opacity: number }[] => bake(curve, (k) => ({ opacity: from + (to - from) * k }));

// The small curves the field, the stars and the noise share.

export const clamp01 = (value: number): number => Math.min(1, Math.max(0, value));

export const lerp = (from: number, to: number, by: number): number => from + (to - from) * by;

/** From 0 at `from` to 1 at `to`, with no kink at either end. */
export function smoothstep(from: number, to: number, value: number): number {
  const by = clamp01((value - from) / (to - from));
  return by * by * (3 - 2 * by);
}

/** The same with no kink in its slope either, on [0, 1]: a lattice's lines never show in what it blends. */
export const smootherstep = (by: number): number => by * by * by * (by * (by * 6 - 15) + 10);

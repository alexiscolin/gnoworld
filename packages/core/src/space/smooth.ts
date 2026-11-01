// The two curves the field and the noise share.

/** From 0 at `from` to 1 at `to`, with no kink at either end. */
export function smoothstep(from: number, to: number, value: number): number {
  const by = Math.min(1, Math.max(0, (value - from) / (to - from)));
  return by * by * (3 - 2 * by);
}

/** The same with no kink in its slope either, on [0, 1]: a lattice's lines never show in what it blends. */
export const smootherstep = (by: number): number => by * by * by * (by * (by * 6 - 15) + 10);

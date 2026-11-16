// The small curves the field, the stars and the noise share.

export const clamp01 = (value: number): number => Math.min(1, Math.max(0, value));

/** From 0 at `from` to 1 at `to`, with no kink at either end. */
export function smoothstep(from: number, to: number, value: number): number {
  const by = clamp01((value - from) / (to - from));
  return by * by * (3 - 2 * by);
}

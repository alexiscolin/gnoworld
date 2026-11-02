// What a seed's bytes and a span make of each other: apart from the looks, so what reads a seed alone stays out of the chunks that draw them.

/** `share` of the way across a span. */
export const between = ([from, to]: readonly [number, number], share: number): number => from + (to - from) * share;
/** Byte `index` of a seed, as a share. */
export const seedShare = (seed: Uint8Array, index: number): number => (seed[index] ?? 0) / 255;

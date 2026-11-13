// An address's face as numbers (docs/DESIGN-SYSTEM.md, "Avatar"; slice-2e.md §2): a 32-bit hash of
// its letters seeds a stream of numbers in [0, 1), read in a fixed order. Pure: no clock, no chance,
// no network, no cache: about a microsecond a face (F318).

/** A face's parts: in a 48-unit disc centred on (24, 24), the clouds as fractions of its box. */
export interface Parts {
  hues: readonly [number, number, number];
  clouds: readonly (readonly [number, number])[];
  stars: readonly (readonly [number, number])[];
  order: number;
  bright: number;
}

// An account's address: g1, then 38 letters of bech32's alphabet. Its checksum is not the face's.
const ADDRESS = /^g1[qpzry9x8gf2tvdw0s3jn54khce6mua7l]{38}$/;

/** The three lines through the five stars, by their fifths: round, a star, a zigzag. */
export const ORDERS = [
  [0, 1, 2, 3, 4],
  [0, 2, 4, 1, 3],
  [0, 1, 3, 2, 4],
] as const;

// FNV-1a, 32 bits: core's `textHash` is its twin, which ui may not import (docs/ARCHITECTURE.md).
function hash(text: string): number {
  let h = 0x811c9dc5;
  for (let i = 0; i < text.length; i++) h = Math.imul(h ^ text.charCodeAt(i), 0x01000193);
  return h >>> 0;
}

// mulberry32: a stream of numbers in [0, 1) from one 32-bit seed, each step mixing it again.
function stream(seed: number): () => number {
  let state = seed;
  return () => {
    state = (state + 0x6d2b79f5) >>> 0;
    let t = Math.imul(state ^ (state >>> 15), state | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4_294_967_296;
  };
}

// Three hues 60 to 180 degrees apart round the wheel, so the third gap is 60 or more too.
function hues(next: () => number): Parts["hues"] {
  const first = next() * 360;
  const second = 60 + next() * 120;
  const third = 60 + next() * (240 - second);
  return [first, (first + second) % 360, (first + second + third) % 360];
}

// A star in each fifth of the disc, away from its edges, at 0.45 to 0.85 of the radius: no two
// closer than 5 units, so the shape stays open at 20 px.
function stars(next: () => number): Parts["stars"] {
  const turn = next() * 72;
  return Array.from({ length: 5 }, (_, fifth) => {
    const angle = ((turn + (fifth + 0.2 + next() * 0.6) * 72) * Math.PI) / 180;
    const radius = 24 * (0.45 + next() * 0.4);
    return [24 + radius * Math.cos(angle), 24 + radius * Math.sin(angle)] as const;
  });
}

function draw(next: () => number): Parts {
  return {
    hues: hues(next),
    clouds: Array.from({ length: 3 }, () => [0.1 + next() * 0.8, 0.1 + next() * 0.8] as const),
    stars: stars(next),
    order: Math.floor(next() * ORDERS.length),
    bright: Math.floor(next() * 5),
  };
}

/** The face's parts for an address, the same each time; null for anything that is not one. */
export function partsFrom(address: string): Parts | null {
  return ADDRESS.test(address) ? draw(stream(hash(address))) : null;
}

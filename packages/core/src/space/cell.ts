// A cell's hash and its stream (ADR-0002 §10, "Two layers"): the scenery comes from a position and nothing else. Plain numbers, with no
// closure and no string, as a frame can cross a cell. ui's Avatar has its own FNV-1a and mulberry32: neither package may import the other.

export interface Point {
  readonly x: number;
  readonly y: number;
  readonly z: number;
}

const PRIME = 0x01000193;
const WORD = 2 ** 32;

/** Where a salt's hashes start. */
export const salted = (salt: number): number => Math.imul(salt ^ 0x811c9dc5, PRIME);

/** Mixes in an integer of any size, its low word and then its high one. */
export const mix = (hash: number, value: number): number =>
  Math.imul(Math.imul(hash ^ (value >>> 0), PRIME) ^ Math.floor(value / WORD), PRIME);

/** Spreads a hash over all its bits, murmur3's way: 32 bits out, whole and unsigned. */
export function settle(hash: number): number {
  let mixed = hash ^ (hash >>> 15);
  mixed = Math.imul(mixed, 0x2c1b3c6d);
  mixed ^= mixed >>> 12;
  mixed = Math.imul(mixed, 0x297a2d39);
  return (mixed ^ (mixed >>> 15)) >>> 0;
}

/** The hash of a cell, one for each salt. */
export const cellHash = (salt: number, cell: Point): number =>
  settle(mix(mix(mix(salted(salt), cell.x), cell.y), cell.z));

/** mulberry32's step: a state walks, and `unitOf` reads a number from each. */
export const nextState = (state: number): number => (state + 0x6d2b79f5) >>> 0;

/** A number in [0, 1) from a state. */
export function unitOf(state: number): number {
  let mixed = Math.imul(state ^ (state >>> 15), state | 1);
  mixed ^= mixed + Math.imul(mixed ^ (mixed >>> 7), mixed | 61);
  return ((mixed ^ (mixed >>> 14)) >>> 0) / WORD;
}

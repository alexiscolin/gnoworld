// The sun's beat (ADR-0001 §7, "gno.land as the sun, pulsing on each block"; slice 7 answer 11): the great star swells once a block, at the
// chain's pace from the time the worlds' file was written, and rests between. A sign of real data: a file with no time gives none, and so
// does one read more than an hour from its writing, before or after, for the job writes it each half hour and the pace is then not known.
// One read fresh beats as long as its page stays.
import { BLOCK_MS } from "../planet/activity.ts";
import { smoothstep } from "./smooth.ts";

// A fast rise and a slow fall: a heartbeat, not a blink.
const RISE_MS = 200;
const FALL_MS = 1100;
const KNOWN_MS = 60 * 60_000;

/** The great star's swell at `now`, 0 to 1, from a file written at `written` and read at `read`, all in milliseconds. */
export function beatAt(written: number, now: number, read: number): number {
  if (!(Math.abs(read - written) <= KNOWN_MS)) return 0;
  const into = (((now - written) % BLOCK_MS) + BLOCK_MS) % BLOCK_MS;
  if (into <= RISE_MS) return smoothstep(0, RISE_MS, into);
  return Math.max(0, 1 - (into - RISE_MS) / FALL_MS) ** 2;
}

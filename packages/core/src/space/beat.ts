// The sun's beat (ADR-0001 §7, "gno.land as the sun, pulsing on each block"; slice 7 answer 11): the great star swells once a block, at the
// chain's pace from the time the worlds' file was written, and rests between. A sign of real data: a file with no time gives none, and so
// does one written more than an hour before, for the job writes it each half hour and the chain's pace is no longer known.
import { BLOCK_MS, RUN_BLOCKS } from "../planet/activity.ts";
import { smoothstep } from "./smooth.ts";

// A fast rise and a slow fall: a heartbeat, not a blink.
const RISE_MS = 200;
const FALL_MS = 1100;
const KNOWN_MS = RUN_BLOCKS * BLOCK_MS;

/** The great star's swell at `now`, 0 to 1, from a file written at `written`, both in milliseconds. */
export function beatAt(written: number, now: number): number {
  if (!(now - written <= KNOWN_MS)) return 0;
  const into = (((now - written) % BLOCK_MS) + BLOCK_MS) % BLOCK_MS;
  if (into <= RISE_MS) return smoothstep(0, RISE_MS, into);
  return Math.max(0, 1 - (into - RISE_MS) / FALL_MS) ** 2;
}

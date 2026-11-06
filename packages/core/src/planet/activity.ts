// A world's pace (ADR-0002 §3 and §10), pure: an aurora means a run of calls and fades with the run, never always on; storms mean its rooms'
// pace, one large and two small at most. Each intensity follows its count's logarithm and is capped. Calls merge into one intensity: no flash
// per call. Time and heights come in as parameters. Tier 1 (docs/REVIEW.md).
import { presenceOf, share } from "./gauges.ts";

/** A run's light lasts this many blocks after its last call: an hour of Onyx's 4 s blocks (gnomcp, 2026-11-02). */
export const RUN_BLOCKS = 900;
/** One block of the chain, in milliseconds, to age a file the job has not written again. */
export const BLOCK_MS = 4000;
/** The rooms' lines a storm counts. */
export const STORM_WINDOW_MS = 10 * 60_000;
// A full storm: twelve lines a minute through the window's ten. No source gives the busiest world's pace, so the ladder is fixed.
const STORM_TOP = 120;
const SMALL = 0.5;

export interface Called {
  /** All the world's calls, null where none was read. */
  readonly calls: number | null;
  /** The height of its last call. */
  readonly lastHeight: number | null;
}

/** The aurora of a world `called` so, at the chain's height `newest`, its calls weighed against the universe's `top`. */
export function auroraOf({ calls, lastHeight }: Called, newest: number | null, top: number): number {
  if (calls === null || lastHeight === null || newest === null) return 0;
  const left = share(1 - (newest - lastHeight) / RUN_BLOCKS);
  return presenceOf(calls, top) * left;
}

const smallOf = (pace: number, from: number) => (pace > from ? ((pace - from) / (1 - from)) * SMALL : 0);

/** The large storm and the two small ones the lines at `times` raise at `now`. */
export function stormsOf(times: readonly number[], now: number): [number, number, number] {
  const said = times.filter((time) => time <= now && now - time <= STORM_WINDOW_MS).length;
  const pace = presenceOf(said, STORM_TOP);
  return [pace, smallOf(pace, 1 / 3), smallOf(pace, 2 / 3)];
}

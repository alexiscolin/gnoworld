// The UTC day of a call (slice 13a), from its block's own time as the indexer gives it: a few rounds of blocks asked per day boundary, each
// span cut into as many parts as a request holds, never a height-to-date line, fifty to a request (onyx-1 answered fifty in 246 ms,
// onyxRollup.json).
import { blockTimes } from "@gnoworld/chain/asks";
import { z } from "zod";
import { request, type Reading } from "./history.ts";
import { Failure } from "./remote.ts";

/** The most heights one request asks the time of. */
export const BLOCKS_PER_ASK = 50;

/** Each height's UTC day, and the exact time of the heights asked. */
export interface Dated {
  readonly days: ReadonlyMap<number, string>;
  readonly times: ReadonlyMap<number, string>;
}

const Blocks = z.object({
  data: z.record(
    z.string(),
    z.nullable(z.array(z.object({ height: z.number(), time: z.iso.datetime({ offset: true }) }))),
  ),
  errors: z.optional(z.never()),
});

/** The time of each block of `heights` in an answer to `blockTimes(heights)`, to the millisecond; a block missing or another fails. */
export function parseBlockTimes(json: unknown, heights: readonly number[]): Map<number, string> {
  const answer = Blocks.safeParse(json);
  if (!answer.success) throw new Failure("shape");
  return new Map(
    heights.map((height, i) => {
      const block = answer.data.data[`b${String(i)}`]?.[0];
      if (block?.height !== height) throw new Failure("shape");
      return [height, new Date(block.time).toISOString()];
    }),
  );
}

/** The times of some heights, BLOCKS_PER_ASK a request of the read. */
export async function timesOf(reading: Reading, heights: readonly number[]): Promise<Map<number, string>> {
  const times = new Map<number, string>();
  for (let at = 0; at < heights.length; at += BLOCKS_PER_ASK) {
    const some = heights.slice(at, at + BLOCKS_PER_ASK);
    for (const [height, time] of parseBlockTimes(await request(reading, blockTimes(some)), some))
      times.set(height, time);
  }
  return times;
}

// Whether a span of sorted heights whose ends' times are known is dated: each height when both ends fall on one day, each end its own when
// they are next to each other; else it is to be cut.
function dated(
  sorted: readonly number[],
  [lo, hi]: readonly [number, number],
  known: { times: Map<number, string>; days: Map<number, string> },
): boolean {
  const timeAt = (i: number) => known.times.get(sorted[i] ?? -1) ?? "";
  const [low, high] = [timeAt(lo), timeAt(hi)];
  if (low > high) throw new Failure("shape");
  if (low.slice(0, 10) !== high.slice(0, 10) && hi - lo > 1) return false;
  for (let i = lo; i <= hi; i += 1) {
    const height = sorted[i] ?? -1;
    known.days.set(height, (known.times.get(height) ?? low).slice(0, 10));
  }
  return true;
}

// A span cut into `parts` at evenly spread heights, at most one a height.
function cut([lo, hi]: readonly [number, number], parts: number): (readonly [number, number])[] {
  const cuts = Math.min(parts, hi - lo);
  const bounds = Array.from({ length: cuts + 1 }, (_, k) => lo + Math.round((k * (hi - lo)) / cuts));
  return bounds.slice(1).map((end, k) => [bounds[k] ?? lo, end] as const);
}

/**
 * The UTC day of each height, from the times `ask` gives: the two ends first, then evenly spread heights of each span whose ends fall on two
 * days, a request's worth a round, until each span holds one day or none between its ends. A time that goes back as height rises fails.
 */
export async function daysOf(
  heights: readonly number[],
  ask: (heights: readonly number[]) => Promise<Map<number, string>>,
): Promise<Dated> {
  const sorted = [...new Set(heights)].sort((a, b) => a - b);
  const known = { times: new Map<number, string>(), days: new Map<number, string>() };
  let spans: (readonly [number, number])[] = sorted.length === 0 ? [] : [[0, sorted.length - 1]];
  let probes = [...new Set([sorted[0] ?? -1, sorted.at(-1) ?? -1])];
  while (spans.length > 0) {
    for (const [height, time] of await ask(probes)) known.times.set(height, new Date(time).toISOString());
    const open = spans.filter((span) => !dated(sorted, span, known));
    const parts = Math.max(2, Math.floor(BLOCKS_PER_ASK / Math.max(1, open.length)));
    spans = open.flatMap((span) => cut(span, parts));
    // The new ends of the cut spans, each asked once.
    probes = [...new Set(spans.flatMap(([lo, hi]) => [sorted[lo] ?? -1, sorted[hi] ?? -1]))].filter(
      (height) => !known.times.has(height),
    );
  }
  return known;
}

/** Whether the block the state was dated by still has its time: a chain restarted under the same name has none, or another. */
export async function anchorHolds(reading: Reading, anchor: { height: number; time: string }): Promise<boolean> {
  const answer = Blocks.safeParse(await request(reading, blockTimes([anchor.height])));
  if (!answer.success) throw new Failure("shape");
  const block = answer.data.data["b0"]?.[0];
  return block?.height === anchor.height && new Date(block.time).toISOString() === anchor.time;
}

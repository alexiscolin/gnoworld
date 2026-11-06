// The calls of the chain a room draws among its messages (slice 9g): which they are, and where each stands. Asked by the lines view,
// which is a chunk of its own.
import { use } from "react";
import type { ChainHeard } from "../../store/chain.ts";
import { ChainCallsContext, ChainPlaceContext, type ChainPlace } from "./chainThread.ts";

/** The calls a room draws at most, the newest. */
const SHOWN = 20;

/** The calls the room in view draws: its world's own, of the page's universe, none in any other room. */
export function callsIn(
  calls: readonly ChainHeard[],
  place: ChainPlace | undefined,
  room: string | undefined,
): readonly ChainHeard[] {
  if (place === undefined || room !== `#${place.slug}`) return [];
  return calls.filter(({ universe }) => universe === place.universe).slice(-SHOWN);
}

/** A line, or a call with the key its item is drawn under (the event's own id). */
export type Entry<L> = { line: L } | { call: ChainHeard; key: string };

function entryOf(calls: readonly ChainHeard[], at: number): Entry<never> {
  const call = calls[at];
  if (call === undefined) throw new Error("no such call");
  return { call, key: call.id };
}

/** Lines and calls in one order, oldest first: a call stands before the first line that is newer than the time it was heard. */
export function interleave<L extends { time: string }>(lines: readonly L[], calls: readonly ChainHeard[]): Entry<L>[] {
  const entries: Entry<L>[] = [];
  let next = 0;
  for (const line of lines) {
    for (; next < calls.length && (calls[next]?.at ?? "") < line.time; next += 1) entries.push(entryOf(calls, next));
    entries.push({ line });
  }
  for (; next < calls.length; next += 1) entries.push(entryOf(calls, next));
  return entries;
}

/** The room's lines with the calls it draws among them, as the page's contexts give them. */
export function useEntries<L extends { time: string }>(lines: readonly L[], room: string | undefined): Entry<L>[] {
  return interleave(lines, callsIn(use(ChainCallsContext), use(ChainPlaceContext), room));
}

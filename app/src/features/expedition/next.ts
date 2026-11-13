// Where today's expedition goes next (slice 8): the day's stops, those this device reached and the first it has not; the next stop is read
// from the device as the question comes, so another tab's visit counts.
import { reachedOn, utcDay } from "@gnoworld/core";
import { pageDevice } from "../../lib/keep/device.ts";
import { stopsOn, type Stop } from "./stops.ts";

/** The day's stops in `universe`, the keys `done` (the device's expedition) reached that day, how many of the stops that is, and the first
 * stop not reached; none once all are. */
export function progressOn(
  universe: string,
  day: string,
  done: Parameters<typeof reachedOn>[0],
): { stops: Stop[]; reached: ReadonlySet<string>; count: number; next: Stop | undefined } {
  const stops = stopsOn(universe, day);
  const reached = new Set(reachedOn(done, day));
  return {
    stops,
    reached,
    count: stops.filter(({ key }) => reached.has(key)).length,
    next: stops.find(({ key }) => !reached.has(key)),
  };
}

/** The next stop of the day in `universe`, and how many of the day's stops are reached; none once all are. */
export function nextStop(universe: string, now = new Date()): { stop: Stop; reached: number; of: number } | undefined {
  const { stops, count, next } = progressOn(universe, utcDay(now), pageDevice().read("expedition") ?? null);
  return next === undefined ? undefined : { stop: next, reached: count, of: stops.length };
}

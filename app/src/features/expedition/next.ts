// Where today's expedition goes next (slice 8): the first of the day's stops this device has not reached, read from the device as the
// question comes, so another tab's visit counts.
import { reachedOn, utcDay } from "@gnoworld/core";
import { pageDevice } from "../../lib/keep/device.ts";
import { stopsOn, type Stop } from "./stops.ts";

/** The next stop of the day in `universe`, and how many of the day's stops are reached; none once all are. */
export function nextStop(universe: string, now = new Date()): { stop: Stop; reached: number; of: number } | undefined {
  const day = utcDay(now);
  const stops = stopsOn(universe, day);
  const done = new Set(reachedOn(pageDevice().read("expedition") ?? null, day));
  const stop = stops.find(({ key }) => !done.has(key));
  return stop === undefined
    ? undefined
    : { stop, reached: stops.filter(({ key }) => done.has(key)).length, of: stops.length };
}

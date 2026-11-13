// The chain reads one unlisted realm path may cause (D413), every one bounded: per visitor and in all an hour, a few in flight at once,
// one flight for a path however many ask it, and a path found missing remembered for an hour in a map of a fixed size. Each check and
// its spend sit before the first await, so asks in flight together are counted as they start.
import { makeFlights } from "../flights.ts";
import { remember } from "../remember.ts";
import type { OnChain } from "./onChain.ts";

const HOUR = 60 * 60_000;

interface Options {
  onChain: (path: string) => Promise<OnChain>;
  now: () => number;
  // The reads a visitor causes an hour.
  perVisitor?: number;
  // The reads in flight at once.
  inFlight?: number;
  // The reads in all an hour.
  perHour?: number;
  // The paths found missing that are remembered.
  missingKeys?: number;
}

export type Reading = OnChain | "limit";

export function makeReads({
  onChain,
  now,
  perVisitor = 5,
  inFlight = 4,
  perHour = 1_000,
  missingKeys = 1_000,
}: Options): (path: string, visitor: string) => Promise<Reading> {
  const flights = makeFlights<OnChain>({ now, perVisitor, inFlight, perHour });
  const missing = new Map<string, number>();
  return (path, visitor) => {
    const at = missing.get(path);
    if (at !== undefined && now() - at < HOUR) return Promise.resolve("no");
    const flight = flights(path, visitor, () =>
      onChain(path)
        .catch((): OnChain => "down")
        .then((found) => {
          if (found === "no") remember(missing, [path, now()], missingKeys);
          return found;
        }),
    );
    return flight === "limit" ? Promise.resolve("limit") : flight;
  };
}

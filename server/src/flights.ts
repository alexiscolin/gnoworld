// The chain reads a visitor may cause, every one bounded: per visitor and in all an hour, a few in flight at once, one flight for a key
// however many ask it. Each check and its spend sit before the first await, so asks in flight together are counted as they start.
import { limiter } from "./limit.ts";
import { remember } from "./remember.ts";

const HOUR = 60 * 60_000;

export interface FlightLimits {
  now: () => number;
  /** The reads a visitor starts an hour. */
  perVisitor: number;
  /** The reads in flight at once. */
  inFlight: number;
  /** The reads started in all an hour. */
  perHour: number;
}

/** One flight a key however many ask it: `start` runs one under its key, which `get` gives until it settles. */
export function singleFlight<T>() {
  const flights = new Map<string, Promise<T>>();
  return {
    get: (key: string): Promise<T> | undefined => flights.get(key),
    size: (): number => flights.size,
    start(key: string, start: () => Promise<T>): Promise<T> {
      const started = start().finally(() => {
        if (flights.get(key) === started) flights.delete(key);
      });
      flights.set(key, started);
      return started;
    },
  };
}

/** The flight of `key`, started by `start` when none runs and the limits allow it, or "limit". Asking a running flight spends nothing. */
export function makeFlights<T>({ now, perVisitor, inFlight, perHour }: FlightLimits) {
  const visitors = limiter({ max: perVisitor, windowMs: HOUR, keys: 100_000 });
  const all = limiter({ max: perHour, windowMs: HOUR, keys: 1 });
  const flights = singleFlight<T>();
  return (key: string, visitor: string, start: () => Promise<T>): Promise<T> | "limit" => {
    const flight = flights.get(key);
    if (flight !== undefined) return flight;
    if (visitors.full(visitor, now()) || all.full("all", now()) || flights.size() >= inFlight) return "limit";
    visitors.take(visitor, now());
    all.take("all", now());
    return flights.start(key, start);
  };
}

/** A read kept by key until the time `until` gives its value (none: not kept, `most` keys at most), else the flight running for it, else a
 * flight started when the site-wide bucket of `perSecond` allows, or "limit": only a started flight spends the bucket. */
export function keptFlights<T>({
  now,
  perSecond,
  most,
  until,
}: {
  now: () => number;
  perSecond: number;
  most: number;
  until: (value: T) => number | undefined;
}) {
  const kept = new Map<string, { value: T; until: number }>();
  const flights = singleFlight<T>();
  const bucket = limiter({ max: perSecond, windowMs: 1000, keys: 1 });
  return (key: string, start: () => Promise<T>): Promise<T> | "limit" => {
    const held = kept.get(key);
    if (held !== undefined && held.until > now()) return Promise.resolve(held.value);
    const running = flights.get(key);
    if (running !== undefined) return running;
    if (!bucket.take("all", now())) return "limit";
    return flights.start(key, async () => {
      const value = await start();
      const at = until(value);
      if (at !== undefined) remember(kept, [key, { value, until: at }], most);
      return value;
    });
  };
}

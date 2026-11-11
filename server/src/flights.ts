// The chain reads a visitor may cause, every one bounded: per visitor and in all an hour, a few in flight at once, one flight for a key
// however many ask it. Each check and its spend sit before the first await, so asks in flight together are counted as they start.
import { limiter } from "./limit.ts";

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

/** The flight of `key`, started by `start` when none runs and the limits allow it, or "limit". Asking a running flight spends nothing. */
export function makeFlights<T>({ now, perVisitor, inFlight, perHour }: FlightLimits) {
  const visitors = limiter({ max: perVisitor, windowMs: HOUR, keys: 100_000 });
  const all = limiter({ max: perHour, windowMs: HOUR, keys: 1 });
  const flights = new Map<string, Promise<T>>();
  return (key: string, visitor: string, start: () => Promise<T>): Promise<T> | "limit" => {
    const flight = flights.get(key);
    if (flight !== undefined) return flight;
    if (visitors.full(visitor, now()) || all.full("all", now()) || flights.size >= inFlight) return "limit";
    visitors.take(visitor, now());
    all.take("all", now());
    const started = start().finally(() => {
      flights.delete(key);
    });
    flights.set(key, started);
    return started;
  };
}

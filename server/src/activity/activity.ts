// How busy each room is (slice 3's plan, 3h): messages a minute over the last five minutes, counted in
// memory, which calls no service (ADR-0002, the heat). An account counts 10 times a minute at most, so a
// spammer fakes no storm; the rooms and accounts it holds are capped. A guest's relayed line (D430) is counted apart: the plate
// shows it (D374), the history never does (D353).
import { limiter } from "../limit.ts";

export interface Activity {
  count: (room: string, account: string, now: number) => void;
  rates: (rooms: readonly string[], now: number) => Map<string, number>;
  // A guest's relayed line: in `guestRates` alone, never in `rates`, which the history reads.
  countGuest: (room: string, name: string, now: number) => void;
  guestRates: (rooms: readonly string[], now: number) => Map<string, number>;
  // What it holds: accounts, rooms, and the minutes counted across rooms; the guest names held.
  size: () => { accounts: number; rooms: number; minutes: number; guests: number };
}

const WINDOW = 5;
const ROOMS_MAX = 10_000;
const minuteOf = (now: number): number => Math.floor(now / 60_000);

// One kind of speaker: each counts 10 times a minute at most, and per room the count of each of its last minutes.
function counter() {
  const speakers = limiter({ max: 10, windowMs: 60_000, keys: 100_000 });
  const rooms = new Map<string, Map<number, number>>();
  const count = (room: string, who: string, now: number): void => {
    if (!speakers.take(who, now)) return;
    let minutes = rooms.get(room);
    if (minutes === undefined) {
      if (rooms.size >= ROOMS_MAX) return;
      minutes = new Map();
      rooms.set(room, minutes);
    }
    const current = minuteOf(now);
    minutes.set(current, (minutes.get(current) ?? 0) + 1);
    for (const old of minutes.keys()) if (old <= current - WINDOW) minutes.delete(old);
  };
  const rates = (asked: readonly string[], now: number): Map<string, number> => {
    const current = minuteOf(now);
    return new Map(
      asked.map((room) => {
        let total = 0;
        // A minute ahead of the clock (one set back) counts for nothing yet.
        for (const [at, held] of rooms.get(room) ?? []) if (at > current - WINDOW && at <= current) total += held;
        return [room, total / WINDOW];
      }),
    );
  };
  return { speakers, rooms, count, rates };
}

export function makeActivity(): Activity {
  const accounts = counter();
  const guests = counter();
  return {
    count: accounts.count,
    rates: accounts.rates,
    countGuest: guests.count,
    guestRates: guests.rates,
    size: () => ({
      accounts: accounts.speakers.size(),
      rooms: accounts.rooms.size,
      minutes: [...accounts.rooms.values()].reduce((held, minutes) => held + minutes.size, 0),
      guests: guests.speakers.size(),
    }),
  };
}

// How busy each room is (slice 3's plan, 3h): messages a minute over the last five minutes, counted in
// memory, which calls no service (ADR-0002, the heat). An account counts 10 times a minute at most, so a
// spammer fakes no storm; the rooms and accounts it holds are capped.
import { limiter } from "../limit.ts";

export interface Activity {
  count: (room: string, account: string, now: number) => void;
  rates: (rooms: readonly string[], now: number) => Map<string, number>;
  // What it holds: accounts, rooms, and the minutes counted across rooms.
  size: () => { accounts: number; rooms: number; minutes: number };
}

export function makeActivity(): Activity {
  const window = 5;
  const accounts = limiter({ max: 10, windowMs: 60_000, keys: 100_000 });
  // Per room, the count of each of its last minutes, by the minute's number.
  const rooms = new Map<string, Map<number, number>>();
  const roomsMax = 10_000;
  const minute = (now: number): number => Math.floor(now / 60_000);
  return {
    count(room, account, now) {
      if (!accounts.take(account, now)) return;
      let minutes = rooms.get(room);
      if (minutes === undefined) {
        if (rooms.size >= roomsMax) return;
        minutes = new Map();
        rooms.set(room, minutes);
      }
      const current = minute(now);
      minutes.set(current, (minutes.get(current) ?? 0) + 1);
      for (const old of minutes.keys()) if (old <= current - window) minutes.delete(old);
    },
    rates(asked, now) {
      const current = minute(now);
      return new Map(
        asked.map((room) => {
          let total = 0;
          // A minute ahead of the clock (one set back) counts for nothing yet.
          for (const [at, count] of rooms.get(room) ?? []) if (at > current - window && at <= current) total += count;
          return [room, total / window];
        }),
      );
    },
    size: () => ({
      accounts: accounts.size(),
      rooms: rooms.size,
      minutes: [...rooms.values()].reduce((held, minutes) => held + minutes.size, 0),
    }),
  };
}

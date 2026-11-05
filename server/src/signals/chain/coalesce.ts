// The cap on what a room is told (slice 9g): 4 events a second a room at most, in any window of a second, the first four kept
// (a refused event leaves a gap the heights show: the chain is the truth, never a queue to grow).
const PER_SECOND = 4;
const WINDOW_MS = 1000;
const ROOMS = 10_000;

export function makeCoalescer({ now }: { now: () => number }) {
  const rooms = new Map<string, number[]>();
  let purged = Number.NEGATIVE_INFINITY;
  return {
    /** Whether an event of this room goes through now. */
    admit(room: string): boolean {
      const time = now();
      // A room quiet for a second is forgotten, at most once a second: what is held stays bounded.
      if (time - purged >= WINDOW_MS) {
        purged = time;
        for (const [name, stamps] of rooms) if ((stamps.at(-1) ?? 0) <= time - WINDOW_MS) rooms.delete(name);
      }
      const held = (rooms.get(room) ?? []).filter((stamp) => stamp > time - WINDOW_MS);
      if (held.length >= PER_SECOND || (!rooms.has(room) && rooms.size >= ROOMS)) {
        if (rooms.has(room)) rooms.set(room, held);
        return false;
      }
      rooms.set(room, [...held, time]);
      return true;
    },
    /** The rooms held, for the tests of the bound. */
    size: (): number => rooms.size,
  };
}

// The cap on what a room is told (slice 9g): 4 events a second a room at most, in any window of a second, the first four kept
// (a refused event leaves a gap the heights show: the chain is the truth, never a queue to grow), and one of an actor, so an
// account at the head of each block cannot fill a room alone (F5792).
const PER_SECOND = 4;
const WINDOW_MS = 1000;
const ROOMS = 10_000;

// Whether the window holds its four, or an event of this actor already.
const full = (held: { actor: string | undefined }[], actor: string | undefined): boolean =>
  held.length >= PER_SECOND || (actor !== undefined && held.some((stamp) => stamp.actor === actor));

export function makeCoalescer({ now }: { now: () => number }) {
  const rooms = new Map<string, { at: number; actor: string | undefined }[]>();
  let purged = Number.NEGATIVE_INFINITY;
  return {
    /** Whether an event of this room, by this actor (none: the room's budget alone), goes through now. */
    admit(room: string, actor?: string): boolean {
      const time = now();
      // A room quiet for a second is forgotten, at most once a second: what is held stays bounded.
      if (time - purged >= WINDOW_MS) {
        purged = time;
        for (const [name, stamps] of rooms) if ((stamps.at(-1)?.at ?? 0) <= time - WINDOW_MS) rooms.delete(name);
      }
      const held = (rooms.get(room) ?? []).filter(({ at }) => at > time - WINDOW_MS);
      if (full(held, actor) || (!rooms.has(room) && rooms.size >= ROOMS)) return false;
      rooms.set(room, [...held, { at: time, actor }]);
      return true;
    },
    /** The rooms held, for the tests of the bound. */
    size: (): number => rooms.size,
  };
}

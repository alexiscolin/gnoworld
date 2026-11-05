// The first signals' side of the stream (slice 9h): a signal is told to the readers of any room of its world they may
// read, in the same sequence of ids as the verdicts, and the world's last of each kind is kept for a reader who comes after.
import type { Signal } from "@gnoworld/schemas";
import { worldOf } from "../rooms/rooms.ts";

/** A frame of the stream: the signal as an event of its own, with its id. */
const signalFrame = (id: number, signal: Signal): string =>
  `id: ${String(id)}\nevent: signal\ndata: ${JSON.stringify(signal)}\n\n`;

/** Whether a client that follows these rooms (the ones it may read) follows a room of the world. */
export const follows = (rooms: ReadonlySet<string>, world: string): boolean =>
  [...rooms].some((room) => worldOf(room) === world);

// A world and a kind each have one slot: 5,000 worlds at most, a world past the cap is told live alone.
const KEPT = 10_000;

export function signalRing() {
  const kept = new Map<string, { id: number; signal: Signal }>();
  return {
    /** Keeps the signal under its id, and gives its frame. */
    keep(id: number, signal: Signal): string {
      const key = `${signal.world} ${signal.kind}`;
      if (kept.has(key) || kept.size < KEPT) kept.set(key, { id, signal });
      return signalFrame(id, signal);
    },
    /** The kept signals of the worlds these rooms belong to, newer than `after`, as frames. */
    missed(rooms: ReadonlySet<string>, after: number): { id: number; text: string }[] {
      return [...kept.values()]
        .filter(({ id, signal }) => id > after && follows(rooms, signal.world))
        .map(({ id, signal }) => ({ id, text: signalFrame(id, signal) }));
    },
  };
}

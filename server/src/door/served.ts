// The answers Jarvis gave, kept 10 minutes and served again with no model call (D13985): a fixed ask to anyone who asks the
// same at the same place, a person's own question to the same account in the same room with the same last line (an answer
// may speak of its asker). Only an `answered` is kept. A room's answers go when a line of it is taken or edited. Memory
// alone, 1,000 answers (8,000 code points each at most), the oldest forgotten first.
import type { JarvisAnswer, JarvisQuestion } from "@gnoworld/schemas";
import { remember } from "../remember.ts";

export const SERVED_MAX = 1000;
const KEPT_MS = 10 * 60_000;

/** An ask's key. The function and the realm keep their case: `Vote` is not `vote` in gno. */
export function servedKey(ask: JarvisQuestion, last: string | undefined, account: string): string {
  if (!("ask" in ask)) {
    const words = ask.question.trim().toLowerCase().replace(/\s+/g, " ");
    return JSON.stringify(["own", ask.room, account, last, words]);
  }
  if (ask.ask === "here") return JSON.stringify(["here", ask.room]);
  if (ask.ask === "function") return JSON.stringify(["function", ask.room, ask.realm, ask.function]);
  return JSON.stringify(["catch-up", ask.room, last]);
}

export interface Served {
  get: (key: string) => JarvisAnswer | undefined;
  // `started` is when its call began: an answer of a call begun before its room's last drop is not kept.
  set: (key: string, answer: JarvisAnswer, from: { room: string; started: number }) => void;
  // Every answer kept for a room.
  drop: (room: string) => void;
}

export function makeServed({ now }: { now: () => number }): Served {
  const kept = new Map<string, { answer: JarvisAnswer; until: number; room: string }>();
  const dropped = new Map<string, number>();
  return {
    get(key) {
      const entry = kept.get(key);
      if (entry === undefined) return undefined;
      if (entry.until <= now()) {
        kept.delete(key);
        return undefined;
      }
      return entry.answer;
    },
    set(key, answer, { room, started }) {
      if (answer.status !== "answered" || started <= (dropped.get(room) ?? -Infinity)) return;
      remember(kept, [key, { answer, until: now() + KEPT_MS, room }], SERVED_MAX);
    },
    drop(room) {
      remember(dropped, [room, now()], SERVED_MAX);
      for (const [key, entry] of kept) if (entry.room === room) kept.delete(key);
    },
  };
}

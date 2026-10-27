// A room's history the link reads a page at a time (slice 3's plan, 3j) and the messages of every room, live or in a
// page: each handed on to be checked and counted, but for a batch that answers a line asked by its id (fetch.ts).
import type { Socket } from "node:net";
import type { IrcMessage } from "@gnoworld/core";
import { line, said } from "./lines.ts";
import type { Options, Page, State } from "./reader.ts";

// Half of a check's per-account queue, so a page never fills it with a live line waiting (3j).
const PAGE = 50;

export const earlier = (time: string): string => new Date(Date.parse(time) - 1).toISOString();

// Ergo answers AFTER a msgid it no longer holds (a line hidden by REDACT) with nothing, and AFTER a
// time from the next millisecond on (irc/history/history.go:171-175, irc/handlers.go:940, v2.19.1).
export function history(state: State, s: Socket, { room, after }: { room: string; after: string }): void {
  state.after.set(room, after);
  state.lines.paged(room);
  s.write(line("CHATHISTORY", ["AFTER", room, `timestamp=${after}`, String(PAGE)]));
}

/** The BATCH of a history page, which asks the next page, and the messages, a NOTICE too (slice 3's max review):
 * Ergo relays and keeps it as any line, so it is checked and counted. */
export function pages(
  { onMessage, drained = () => Promise.resolve() }: Options,
  state: State,
): Record<string, (s: Socket, message: IrcMessage) => void> {
  const heard = (_: Socket, message: IrcMessage): void => {
    const ref = message.tags.get("batch") ?? "";
    const batch = state.batches.get(ref);
    // A line asked for by its id goes to its question alone: not counted, not checked, not a page's.
    if (batch?.fetch === true) {
      state.lines.line(ref, said(message, state.joined));
      return;
    }
    // A time Date cannot read is no page's end (F552): the next page starts from the last one read.
    const time = message.tags.get("time") ?? "";
    if (batch !== undefined) {
      batch.lines += 1;
      if (!Number.isNaN(Date.parse(time))) batch.last = time;
    }
    const told = said(message, state.joined);
    if (told !== undefined) onMessage(told);
  };
  // A page ended: a question's batch tells its question; a full page may have more, asked once it is taken in, from
  // its last line's millisecond, which may hold more (F542), or past it for a page all in that one (F542).
  // ponytail: more than a page of lines in one millisecond loses the rest; pages by msgid lose a hidden one.
  const ended = (s: Socket, id: string, done: Page): void => {
    if (done.fetch) state.lines.closed(id);
    else if (done.lines >= PAGE && done.last !== "") {
      const back = earlier(done.last);
      const after = back === state.after.get(done.room) ? done.last : back;
      const next = (): void => {
        if (!s.destroyed) history(state, s, { room: done.room, after });
      };
      drained().then(next, next);
    }
  };
  return {
    BATCH: (s, { params: [ref = "", kind, room = ""] }) => {
      const id = ref.slice(1);
      if (ref.startsWith("+") && kind === "chathistory") {
        state.batches.set(id, { room, lines: 0, last: "", fetch: state.lines.opened(id, room) });
      }
      if (!ref.startsWith("-")) return;
      const done = state.batches.get(id);
      state.batches.delete(id);
      if (done !== undefined) ended(s, id, done);
    },
    NOTICE: heard,
    PRIVMSG: heard,
  };
}

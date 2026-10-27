// A room's history, caught up page by page (slice 3's plan, 3j; slice 4's 4s, F707, F708): asked once Ergo
// says the bot is in the room, one page in flight across all rooms, the room's mark held where its next page
// starts from until the room is done.
import type { Socket } from "node:net";
import { placeBefore, type IrcMessage } from "@gnoworld/core";
import { lineFetches, type Fetches } from "./fetch.ts";
import { line, type Said } from "./lines.ts";

export interface Pages {
  // The time of the last line checked in a room, which the catch-up starts from.
  lastChecked: (room: string) => string | undefined;
  // A room's mark held at the time its next page starts from, or let go (undefined) once the room is done.
  hold: (room: string, time: string | undefined) => void;
  // Settles once what the link handed on is taken in: the next page waits for it.
  drained: () => Promise<void>;
}

/** A chathistory batch open: its room, its lines and the last one's time; `fetch` when it answers a line asked for by
 * its id (fetch.ts, 4d), its lines then going to that question alone. */
interface Page {
  room: string;
  lines: number;
  last: string;
  fetch: boolean;
}

export interface HistoryState {
  // Each chathistory batch open, by its reference.
  batches: Map<string, Page>;
  // The time each room's history was last asked after, so a page that makes no progress is passed.
  after: Map<string, string>;
  // The rooms whose history waits for its turn, and the room whose page is on its way.
  turns: string[];
  page: string | undefined;
  // The lines asked for by their id (4d): they share Ergo's one order of history answers with the pages.
  lines: Fetches;
}

export const freshHistory = (lineMs: number): HistoryState => ({
  batches: new Map(),
  after: new Map(),
  turns: [],
  page: undefined,
  lines: lineFetches(lineMs),
});

// Half of a check's per-account queue, so a page never fills it with a live line waiting (3j).
const PAGE = 50;
// The millisecond before a line's time, which Ergo wrote; the time itself for one with none before it, which only asks that
// line again.
const earlier = (time: string): string => placeBefore(time) ?? time;

type Handler = (s: Socket, message: IrcMessage) => void;

/** The catch-up: `catchUp` on the bot's own JOIN of a room, and the handlers of the batch a page comes in and of
 * a history FAIL. */
export function histories(
  { lastChecked, hold, drained }: Pages,
  state: HistoryState,
): { catchUp: (s: Socket, room: string) => void; handlers: Record<string, Handler> } {
  // Ergo answers AFTER a msgid it no longer holds (a line hidden by REDACT) with nothing, and AFTER a
  // time from the next millisecond on (irc/history/history.go:171-175, irc/handlers.go:940, v2.19.1).
  const ask = (s: Socket, room: string, after: string): void => {
    state.after.set(room, after);
    state.lines.paged(room);
    s.write(line("CHATHISTORY", ["AFTER", room, `timestamp=${after}`, String(PAGE)]));
  };
  // The next room whose turn it is, its first page from a millisecond before its mark: the mark's own line
  // comes again, seen, and none beside it is lost.
  const turn = (s: Socket): void => {
    const room = state.page === undefined ? state.turns.shift() : undefined;
    if (room === undefined) return;
    state.page = room;
    ask(s, room, state.after.get(room) ?? "");
  };
  // Once what a page handed on is in, the room's next page, or its last: the mark let go and the next room's turn.
  const after = (s: Socket, room: string, next: string | undefined): void => {
    const go = (): void => {
      if (s.destroyed || state.page !== room) return;
      hold(room, next);
      if (next !== undefined) {
        ask(s, room, next);
      } else {
        state.page = undefined;
        turn(s);
      }
    };
    drained().then(go, go);
  };
  const ended = (s: Socket, ref: string): void => {
    const batch = state.batches.get(ref);
    state.batches.delete(ref);
    if (batch?.fetch === true) state.lines.closed(ref);
    if (batch === undefined || batch.fetch || batch.room !== state.page) return;
    // A full page may have more after it, from its last line's millisecond, which may hold more (F542). A
    // page all in that one millisecond goes past it.
    // ponytail: more than a page of lines in one millisecond loses the rest; pages by msgid lose a hidden one.
    const more = batch.lines >= PAGE && batch.last !== "";
    const back = more ? earlier(batch.last) : "";
    after(s, batch.room, more ? (back === state.after.get(batch.room) ? batch.last : back) : undefined);
  };
  return {
    catchUp: (s, room) => {
      const last = lastChecked(room);
      if (last === undefined || state.page === room || state.turns.includes(room)) return;
      state.after.set(room, earlier(last));
      hold(room, earlier(last));
      state.turns.push(room);
      turn(s);
    },
    handlers: {
      BATCH: (s, { params: [ref = "", kind, room = ""] }) => {
        if (ref.startsWith("+") && kind === "chathistory")
          state.batches.set(ref.slice(1), { room, lines: 0, last: "", fetch: state.lines.opened(ref.slice(1), room) });
        if (ref.startsWith("-")) ended(s, ref.slice(1));
      },
      // A refused page leaves its room's mark held, and the next room has its turn; a refused question is answered
      // with nothing, Ergo sending no batch for either.
      FAIL: (s, { params: [command] }) => {
        if (command !== "CHATHISTORY") return;
        state.lines.failed();
        if (state.page === undefined) return;
        state.page = undefined;
        turn(s);
      },
    },
  };
}

/** A line of a batch that answers a line asked for by its id goes to that question alone: not counted, not checked, not
 * a page's. True when it was one. */
export function answered(state: HistoryState, message: IrcMessage, heard: Said | undefined): boolean {
  const ref = message.tags.get("batch") ?? "";
  if (state.batches.get(ref)?.fetch !== true) return false;
  state.lines.line(ref, heard);
  return true;
}

/** A line of a chathistory batch is counted in it; true when it came in one. */
export function replayed(state: HistoryState, message: IrcMessage): boolean {
  const batch = state.batches.get(message.tags.get("batch") ?? "");
  if (batch === undefined) return false;
  batch.lines += 1;
  // A time Date cannot read is no page's end (F552): the next page starts from the last one read.
  const time = message.tags.get("time") ?? "";
  if (!Number.isNaN(Date.parse(time))) batch.last = time;
  return true;
}

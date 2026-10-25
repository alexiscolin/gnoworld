// What each line Ergo sends means to the server's IRC link (slice 3's plan, 3h, 3j, 3k, 3l, 3m): its
// registration, its rooms, their history a page at a time, their messages, who joins them and their state
// (state.ts), and the refusals that close it.
import type { Socket } from "node:net";
import type { IrcMessage } from "@gnoworld/core";
import type { Log } from "../log.ts";
import { joined, listing, refusals, rejoins, sasl } from "./handlers.ts";
import { joins, line, said, type Said } from "./lines.ts";
import type { State } from "./session.ts";

export interface Options {
  host: string;
  port: number;
  password: string;
  rooms: () => readonly string[];
  onMessage: (said: Said) => void;
  log: Log;
  retryMs?: (attempt: number) => number;
  pingMs?: number;
  // The time of the last line checked in a room, which the catch-up starts from.
  lastChecked?: (room: string) => string | undefined;
  // Settles once what the link handed on is taken in: the next page waits for it.
  drained?: () => Promise<void>;
  // Each time it is in its rooms again (3k: the mutes put back).
  onReady?: () => void;
  // Ergo's channels, listed each time it is in its rooms (3l: a channel the server did not make).
  onChannels?: (names: readonly string[]) => void;
  // Someone else joined one of its rooms (3m: the reconciler voices a writer at once).
  onJoin?: (room: string) => void;
  // How long a room's state may take to come (3m).
  stateMs?: number;
}

// Half of a check's per-account queue, so a page never fills it with a live line waiting (3j).
const PAGE = 50;

// The lines Ergo sends that ask for an answer, as 3b's table found them.
export function reader(options: Options, state: State) {
  const { password, rooms, onMessage, log, lastChecked = () => undefined, onReady = () => undefined } = options;
  const { drained = () => Promise.resolve(), onChannels, onJoin = () => undefined } = options;
  // Ergo answers AFTER a msgid it no longer holds (a line hidden by REDACT) with nothing, and AFTER a
  // time from the next millisecond on (irc/history/history.go:171-175, irc/handlers.go:940, v2.19.1).
  const history = (s: Socket, room: string, after: string): void => {
    state.after.set(room, after);
    s.write(line("CHATHISTORY", ["AFTER", room, `timestamp=${after}`, String(PAGE)]));
  };
  const earlier = (time: string): string => new Date(Date.parse(time) - 1).toISOString();
  // A refusal Ergo will not change by itself: log it, and try again later and later.
  const refused = (s: Socket, error: string): void => {
    log("irc_refused", { error });
    s.destroy();
  };
  const handlers: Readonly<Record<string, (s: Socket, message: IrcMessage) => void>> = {
    ...sasl(password, refused),
    "001": (s) => {
      state.nickTaken = 0;
      s.write(line("OPER", ["admin", password]));
    },
    "381": (s) => {
      state.upSince = Date.now();
      const names = rooms();
      state.joined = new Set(names);
      for (const join of joins(names)) s.write(join);
      state.ready = true;
      // A millisecond before the mark: the mark's own line comes again, seen, and none beside it is lost.
      for (const room of state.joined) {
        const last = lastChecked(room);
        if (last !== undefined) history(s, room, earlier(last));
      }
      onReady();
      if (onChannels !== undefined) {
        state.channels = [];
        s.write(line("LIST", []));
      }
      log("irc_ready");
    },
    // A second session of its account, the last one not yet timed out (multiclient): Ergo says it is an
    // operator already, and the session is ready as on a 381.
    "400": (s, message) => {
      if (message.params[1] === "OPER") handlers["381"]?.(s, message);
    },
    ...listing(state, onChannels),
    JOIN: joined(state, onJoin),
    ...rejoins(state),
    BATCH: (s, { params: [ref = "", kind, room = ""] }) => {
      if (ref.startsWith("+") && kind === "chathistory") state.batches.set(ref.slice(1), { room, lines: 0, last: "" });
      if (!ref.startsWith("-")) return;
      const done = state.batches.get(ref.slice(1));
      state.batches.delete(ref.slice(1));
      // A full page may have more after it, asked once the last page is taken in, from its last line's
      // millisecond, which may hold more (F542). A page all in that one millisecond goes past it.
      // ponytail: more than a page of lines in one millisecond loses the rest; pages by msgid lose a hidden one.
      if (done === undefined || done.lines < PAGE || done.last === "") return;
      const back = earlier(done.last);
      const from = back === state.after.get(done.room) ? done.last : back;
      const next = (): void => {
        if (!s.destroyed) history(s, done.room, from);
      };
      drained().then(next, next);
    },
    ...refusals(refused, state, log),
    // A hide Ergo refused (F544): the verdict says hidden, the line stays; ops hears of it.
    FAIL: (_, { params: [command] }) => {
      if (command === "REDACT") log("alert", { error: "redact_refused" });
    },
    PING: (s, { params }) => s.write(line("PONG", params)),
    // A NOTICE too (slice 3's max review): Ergo relays and keeps it as any line, so it is checked and counted.
    NOTICE: (s, message) => handlers["PRIVMSG"]?.(s, message),
    PRIVMSG: (_, message) => {
      const batch = state.batches.get(message.tags.get("batch") ?? "");
      // A time Date cannot read is no page's end (F552): the next page starts from the last one read.
      const time = message.tags.get("time") ?? "";
      if (batch !== undefined) {
        batch.lines += 1;
        if (!Number.isNaN(Date.parse(time))) batch.last = time;
      }
      const heard = said(message, state.joined);
      if (heard !== undefined) onMessage(heard);
    },
  };
  return (s: Socket, message: IrcMessage): void => {
    handlers[message.command]?.(s, message);
    state.states.read(message);
  };
}

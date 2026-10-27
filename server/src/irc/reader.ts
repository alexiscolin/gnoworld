// What each line Ergo sends means to the server's IRC link (slice 3's plan, 3h, 3j, 3k, 3l, 3m): its
// registration, its rooms, their history a page at a time, their messages, who joins them and their state
// (state.ts), and the refusals that close it.
import type { Socket } from "node:net";
import type { IrcMessage } from "@gnoworld/core";
import type { Log } from "../log.ts";
import { joined, kicked, listing, refusals, rejoins, sasl } from "./handlers.ts";
import { histories, replayed } from "./history.ts";
import { joins, line, said, type Said } from "./lines.ts";
import type { State } from "./session.ts";

export interface Options {
  host: string;
  port: number;
  password: string;
  rooms: () => readonly string[];
  // `replayed`: the line came in a history page, so it counts as no activity now.
  onMessage: (said: Said, replayed: boolean) => void;
  log: Log;
  retryMs?: (attempt: number) => number;
  pingMs?: number;
  // The time of the last line checked in a room, which the catch-up starts from.
  lastChecked?: (room: string) => string | undefined;
  // A room's mark held at the time its catch-up's next page starts from, or let go (undefined) once the room is
  // done: a live line settling meanwhile moves it no further (F707).
  hold?: (room: string, time: string | undefined) => void;
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

// The lines Ergo sends that ask for an answer, as 3b's table found them.
export function reader(options: Options, state: State) {
  const { password, rooms, onMessage, log, lastChecked = () => undefined, onReady = () => undefined } = options;
  const { drained = () => Promise.resolve(), onChannels, onJoin = () => undefined } = options;
  const { hold = () => undefined } = options;
  const pages = histories({ lastChecked, hold, drained }, state);
  // A refusal Ergo will not change by itself: log it, and try again later and later.
  const refused = (s: Socket, error: string): void => {
    log("irc_refused", { error });
    s.destroy();
  };
  // A line read, counted in its history page, then handed on; a message of several lines the link could not read
  // whole is handed on marked, to be hidden.
  const heard = (message: IrcMessage, readable: boolean): void => {
    const batched = replayed(state, message);
    const got = said(message, state.joined);
    if (got !== undefined) onMessage(readable ? got : { ...got, unreadable: true }, batched);
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
    JOIN: joined(state, onJoin, pages.catchUp),
    ...rejoins(state),
    KICK: kicked(state, log),
    ...pages.handlers,
    BATCH: (s, message) => {
      // A message of several lines is read as one at its end; any other batch is a history page.
      if (!state.several.batch(message, heard)) pages.handlers["BATCH"]?.(s, message);
    },
    ...refusals(refused, state, log),
    // A hide Ergo refused (F544): the verdict says hidden, the line stays; ops hears of it. A line its author
    // deleted first is not one: Ergo knows its id no more. A refused page of history is history.ts's.
    FAIL: (s, message) => {
      if (message.params[0] === "REDACT" && message.params[1] !== "UNKNOWN_MSGID")
        log("alert", { error: "redact_refused" });
      pages.handlers["FAIL"]?.(s, message);
    },
    PING: (s, { params }) => s.write(line("PONG", params)),
    // A NOTICE too (slice 3's max review): Ergo relays and keeps it as any line, so it is checked and counted.
    NOTICE: (s, message) => handlers["PRIVMSG"]?.(s, message),
    PRIVMSG: (_, message) => {
      if (!state.several.hold(message)) heard(message, true);
    },
  };
  return (s: Socket, message: IrcMessage): void => {
    handlers[message.command]?.(s, message);
    state.states.read(message);
  };
}

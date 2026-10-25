// What each line Ergo sends means to the server's IRC link (slice 3's plan, 3h, 3j, 3k, 3l, 3m): its
// registration, its rooms, their history a page at a time, their messages, who joins them and their state
// (state.ts), and the refusals that close it.
import type { Socket } from "node:net";
import type { IrcMessage } from "@gnoworld/core";
import type { Log } from "../log.ts";
import { joins, line, NICK, said, type Said } from "./lines.ts";
import { roomStates, type States } from "./state.ts";

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

export interface State {
  attempt: number;
  // When the link last came in: the backoff starts again only after a minute up.
  upSince?: number | undefined;
  joined: Set<string>;
  ready: boolean;
  // Each chathistory batch open, by its reference: its room, its lines and the last one's time.
  batches: Map<string, { room: string; lines: number; last: string }>;
  // The time each room's history was last asked after, so a page that makes no progress is passed.
  after: Map<string, string>;
  // The rooms joined by send since this connection began, taken as joined once Ergo says so (3l).
  asked: Set<string>;
  // The channels of a LIST under way, 10,000 at most.
  channels: string[] | undefined;
  // The rooms' states asked of Ergo (3m).
  states: States;
  // Its nick refused in a row, connection after connection: the third raises the alert (slice 3's max review).
  nickTaken: number;
}

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

// Ergo's LIST, its channels kept to 10,000, handed on at its end (3l).
function listing(
  state: State,
  onChannels: Options["onChannels"],
): Record<string, (s: Socket, message: IrcMessage) => void> {
  return {
    "322": (_, { params: [, name] }) => {
      if (name?.startsWith("#") === true && state.channels !== undefined && state.channels.length < 10_000) {
        state.channels.push(name);
      }
    },
    "323": () => {
      if (state.channels !== undefined) onChannels?.(state.channels);
      state.channels = undefined;
    },
  };
}

// Its account by SASL PLAIN, the operator's password as its passphrase, which the server's auth script takes
// for gnoworld alone (slice 3's max review); an ACK without sasl sends no password, and a refusal closes.
function sasl(
  password: string,
  refused: (s: Socket, error: string) => void,
): Record<string, (s: Socket, message: IrcMessage) => void> {
  const refuse = (s: Socket): void => {
    refused(s, "sasl");
  };
  return {
    CAP: (s, { params }) => {
      if (params[1] === "ACK" && (params[2] ?? "").split(" ").includes("sasl"))
        s.write(line("AUTHENTICATE", ["PLAIN"]));
      else if (params[1] === "ACK" || params[1] === "NAK") refused(s, "cap");
    },
    AUTHENTICATE: (s, { params: [challenge] }) => {
      if (challenge === "+") s.write(line("AUTHENTICATE", [Buffer.from(`\0${NICK}\0${password}`).toString("base64")]));
    },
    "903": (s) => s.write(line("CAP", ["END"])),
    "902": refuse,
    "904": refuse,
    "905": refuse,
    "906": refuse,
  };
}

// The refusals Ergo will not change by itself: a nick taken (433), a wrong oper password (464, 491). A nick
// taken three times in a row is no ghost's (OPERATIONS.md): ops hears of it, once until the bot is back.
function refusals(
  refused: (s: Socket, error: string) => void,
  state: State,
  log: Log,
): Record<string, (s: Socket) => void> {
  return {
    "433": (s) => {
      state.nickTaken += 1;
      if (state.nickTaken === 3) log("alert", { error: "irc_nick_taken" });
      refused(s, "nick");
    },
    "464": (s) => {
      refused(s, "oper");
    },
    "491": (s) => {
      refused(s, "oper");
    },
  };
}

// Ergo's JOIN: the bot's own takes a room it asked as joined (3l); another's, in one of its rooms, is
// handed on (3m).
function joined(state: State, onJoin: (room: string) => void): (s: Socket, message: IrcMessage) => void {
  return (_, { source, params: [room = ""] }) => {
    if (source?.split("!")[0] !== NICK) {
      if (state.joined.has(room)) onJoin(room);
    } else if (state.asked.has(room)) state.joined.add(room);
  };
}

// A room of its own that refuses the bot (3m: +i, +R, or an operator's +l, +k or +b) is joined by
// SAJOIN, which Ergo grants an operator whatever the room's modes (irc/channel.go:786-792, v2.19.1).
function rejoins(state: State): Record<string, (s: Socket, message: IrcMessage) => void> {
  const rejoin = (s: Socket, { params: [, room = ""] }: IrcMessage): void => {
    if (state.joined.has(room) || state.asked.has(room)) s.write(line("SAJOIN", [room]));
  };
  return Object.fromEntries(["471", "473", "474", "475", "477"].map((code) => [code, rejoin]));
}

export const fresh = (stateMs: number): State => ({
  attempt: 0,
  joined: new Set(),
  ready: false,
  batches: new Map(),
  after: new Map(),
  asked: new Set(),
  channels: undefined,
  states: roomStates(stateMs),
  nickTaken: 0,
});

// The server's IRC link (slice 3's plan, 3h, 3j, 3k): one TCP connection to Ergo's internal listener, as its
// operator, in every room. It reads the rooms' messages, never a direct one, and sends only the commands
// lines.ts lists, each through formatLine. It comes back after a close, and after three unanswered pings,
// then asks each room's history from the time of the last line checked there, a page at a time.
import { connect, type Socket } from "node:net";
import { parseLine, type IrcMessage } from "@gnoworld/core";
import type { Log } from "../log.ts";
import { allowed, joins, line, NICK, said, type Command, type Said } from "./lines.ts";

export type { Said } from "./lines.ts";

export interface Link {
  // The commands of lines.ts alone, in their forms, once it is in its rooms; false when not sent.
  send: (command: Command, params: readonly string[]) => boolean;
  stop: () => Promise<void>;
}

interface Options {
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
}

// Half of a check's per-account queue, so a page never fills it with a live line waiting (3j).
const PAGE = 50;

interface State {
  attempt: number;
  // When the link last came in: the backoff starts again only after a minute up.
  upSince?: number | undefined;
  joined: Set<string>;
  ready: boolean;
  // Each chathistory batch open, by its reference: its room, its lines and the last one's time.
  batches: Map<string, { room: string; lines: number; last: string }>;
  // The time each room's history was last asked after, so a page that makes no progress is passed.
  after: Map<string, string>;
}

// A server's longest line: 8191 bytes of tags with the @ and the space, 510 more, then CR LF.
const LINE_MAX = 8191 + 512;

/** From a second to a minute, doubling, and half of it either way, so a restart is no storm. */
export function retryDelay(attempt: number, random: () => number = Math.random): number {
  return Math.floor(Math.min(1000 * 2 ** attempt, 60_000) * (0.5 + random()));
}

// The lines Ergo sends that ask for an answer, as 3b's table found them.
function reader(options: Options, state: State) {
  const { password, rooms, onMessage, log, lastChecked = () => undefined, onReady = () => undefined } = options;
  const { drained = () => Promise.resolve() } = options;
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
    CAP: (s, { params }) => {
      if (params[1] === "ACK") s.write(line("CAP", ["END"]));
      else if (params[1] === "NAK") refused(s, "cap");
    },
    "001": (s) => s.write(line("OPER", ["admin", password])),
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
      log("irc_ready");
    },
    BATCH: (s, { params: [ref = "", kind, room = ""] }) => {
      if (ref.startsWith("+") && kind === "chathistory") state.batches.set(ref.slice(1), { room, lines: 0, last: "" });
      if (!ref.startsWith("-")) return;
      const done = state.batches.get(ref.slice(1));
      state.batches.delete(ref.slice(1));
      // A full page may have more after it, asked once the last page is taken in, from its last line's
      // millisecond, which may hold more (F542). A page all in that one millisecond goes past it.
      // ponytail: more than a page of lines in one millisecond loses the rest; pages by msgid lose a hidden one.
      if (done === undefined || done.lines < PAGE || done.last === "") return;
      const from = earlier(done.last) === state.after.get(done.room) ? done.last : earlier(done.last);
      const next = (): void => {
        if (!s.destroyed) history(s, done.room, from);
      };
      drained().then(next, next);
    },
    "433": (s) => {
      refused(s, "nick");
    },
    "464": (s) => {
      refused(s, "oper");
    },
    "491": (s) => {
      refused(s, "oper");
    },
    PING: (s, { params }) => s.write(line("PONG", params)),
    PRIVMSG: (_, message) => {
      const batch = state.batches.get(message.tags.get("batch") ?? "");
      if (batch !== undefined)
        Object.assign(batch, { lines: batch.lines + 1, last: message.tags.get("time") ?? batch.last });
      const heard = said(message, state.joined);
      if (heard !== undefined) onMessage(heard);
    },
  };
  return (s: Socket, message: IrcMessage): void => {
    handlers[message.command]?.(s, message);
  };
}

export function ircLink(options: Options): Link {
  const { host, port, log, retryMs = (attempt) => retryDelay(attempt), pingMs = 30_000 } = options;
  let socket: Socket | undefined;
  let stopped = false;
  let retry: ReturnType<typeof setTimeout> | undefined;
  // The backoff starts again from a second only after a minute up: Ergo taking the link in, then
  // dropping it at once, keeps it waiting longer.
  const state: State = { attempt: 0, joined: new Set(), ready: false, batches: new Map(), after: new Map() };
  const read = reader(options, state);
  const open = (): void => {
    const s = connect(port, host);
    socket = s;
    let held = Buffer.alloc(0);
    let silent = 0;
    const watchdog = setInterval(() => {
      if (silent >= 3) s.destroy();
      else s.write(line("PING", ["gnoworld"]));
      silent += 1;
    }, pingMs);
    s.on("connect", () => {
      s.write(line("CAP", ["REQ", "message-tags account-tag batch draft/chathistory server-time"]));
      s.write(line("NICK", [NICK]));
      s.write(line("USER", [NICK, "0", "*", "gno.world"]));
    });
    s.on("data", (chunk: Buffer) => {
      silent = 0;
      held = Buffer.concat([held, chunk]);
      for (let end = held.indexOf(10); end !== -1; end = held.indexOf(10)) {
        // Longer than any line a server may send: not Ergo speaking.
        if (end + 1 > LINE_MAX) {
          s.destroy();
          return;
        }
        const parsed = parseLine(held.subarray(0, end + 1).toString("utf8"));
        held = held.subarray(end + 1);
        // A handler's throw (a database that fails) ends this connection, never the process.
        try {
          if (parsed.ok) read(s, parsed.message);
        } catch (error) {
          log("irc_error", { error: error instanceof Error ? error.name : "unknown" });
          s.destroy();
          return;
        }
      }
      if (held.length > LINE_MAX) s.destroy();
    });
    // The close that follows reconnects.
    s.on("error", () => {
      s.destroy();
    });
    s.on("close", () => {
      clearInterval(watchdog);
      state.ready = false;
      state.batches.clear();
      if (stopped) return;
      log("irc_closed");
      if (state.upSince !== undefined && Date.now() - state.upSince >= 60_000) state.attempt = 0;
      state.upSince = undefined;
      retry = setTimeout(open, retryMs(state.attempt));
      state.attempt += 1;
    });
  };
  open();

  return {
    send: (command, params) => {
      const s = socket;
      // A command or a form lines.ts does not list, whatever its type says, is refused.
      if (!state.ready || s === undefined || !allowed(command, params)) return false;
      // formatLine refuses a line that would break in two; nothing of it is sent.
      try {
        s.write(line(command, params));
        return true;
      } catch {
        return false;
      }
    },
    stop: async () => {
      stopped = true;
      clearTimeout(retry);
      const s = socket;
      if (s === undefined || s.destroyed) return;
      const closed = new Promise((resolve) => s.once("close", resolve));
      s.destroy();
      await closed;
    },
  };
}

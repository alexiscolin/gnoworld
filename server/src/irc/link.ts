// The server's IRC link (slice 3's plan, 3h, 3j, 3k, 3m): one TCP connection to Ergo's internal listener,
// as its operator, in every room. It reads the rooms' messages, never a direct one, and sends only the
// commands lines.ts lists, each through formatLine. It comes back after a close, and after three
// unanswered pings, then asks each room's history from the time of the last line checked there, a page at
// a time. It reads a room's state for the reconciler (rooms/reconcile.ts).
import { connect, type Socket } from "node:net";
import { parseLine, type IrcMessage } from "@gnoworld/core";
import type { Log } from "@gnoworld/service/log";
import type { RoomState } from "../rooms/reconcile.ts";
import { allowed, line, NICK, type Command } from "./lines.ts";
import type { Fetched } from "./fetch.ts";
import { reader, type Options } from "./reader.ts";
import { relayer, RELAY_MS, type Relayed } from "./relay.ts";
import { answering, forget, fresh, sentOn } from "./session.ts";

export type { Fetched } from "./fetch.ts";
export type { Said } from "./lines.ts";

export interface Link {
  // The commands of lines.ts alone, in their forms, once it is in its rooms; false when not sent.
  send: (command: Command, params: readonly string[]) => boolean;
  // A room's flags, invite list and people, once it is in its rooms; undefined otherwise or past stateMs.
  state: (room: string) => Promise<RoomState | undefined>;
  // One line of a room by its id, as Ergo holds it now (4d, pins): "gone" when Ergo holds none, "unanswered" when it
  // could not be asked or did not answer in time.
  line: (room: string, msgid: string) => Promise<Fetched>;
  // A guest's line said by the bot as anon/<name> (RELAYMSG, D430): whether Ergo took it.
  relay: (room: string, nick: string, text: string) => Promise<Relayed>;
  // The relays waiting for Ergo's word now.
  relaying: () => number;
  stop: () => Promise<void>;
}

// How long a line asked for by its id may take: under the 10 s a page waits on the server (lib/api/http.ts).
const LINE_MS = 5000;

// A server's longest line: 8191 bytes of tags with the @ and the space, 510 more, then CR LF.
const LINE_MAX = 8191 + 512;

/** From a second to a minute, doubling, and half of it either way, so a restart is no storm. */
export function retryDelay(attempt: number, random: () => number = Math.random): number {
  return Math.floor(Math.min(1000 * 2 ** attempt, 60_000) * (0.5 + random()));
}

// A connection's bytes cut into lines, each read in turn. A line longer than any server sends, or a
// handler's throw (a database that fails), ends this connection, never the process.
function splitter(s: Socket, read: (s: Socket, message: IrcMessage) => void, log: Log): (chunk: Buffer) => void {
  let held = Buffer.alloc(0);
  return (chunk) => {
    held = Buffer.concat([held, chunk]);
    for (let end = held.indexOf(10); end !== -1; end = held.indexOf(10)) {
      if (end + 1 > LINE_MAX) {
        s.destroy();
        return;
      }
      const parsed = parseLine(held.subarray(0, end + 1).toString("utf8"));
      held = held.subarray(end + 1);
      try {
        if (parsed.ok) read(s, parsed.message);
      } catch (error) {
        log("irc_error", { error: error instanceof Error ? error.name : "unknown" });
        s.destroy();
        return;
      }
    }
    if (held.length > LINE_MAX) s.destroy();
  };
}

// The capabilities it asks, its nick and its user, the lines a connection opens with. multi-prefix: NAMES gives each person every power;
// sasl: the bot logs in as its account; message-redaction: Ergo tells each REDACT, the bot's own too (irc/handlers.go:3010), for the pins;
// draft/multiline: a message of several lines comes whole (several.ts); labeled-response: Ergo's answer to a relay carries its label (D430).
function greet(s: Socket): void {
  const caps =
    "message-tags account-tag batch draft/chathistory server-time multi-prefix sasl draft/message-redaction draft/multiline labeled-response";
  s.write(line("CAP", ["REQ", caps]));
  s.write(line("NICK", [NICK]));
  s.write(line("USER", [NICK, "0", "*", "gno.world"]));
}

export function ircLink(options: Options): Link {
  const { host, port, log, retryMs = (attempt) => retryDelay(attempt), pingMs = 30_000 } = options;
  let socket: Socket | undefined;
  let stopped = false;
  let retry: ReturnType<typeof setTimeout> | undefined;
  // The backoff starts again from a second only after a minute up: Ergo taking the link in, then
  // dropping it at once, keeps it waiting longer.
  const state = fresh(options.stateMs ?? 10_000, options.lineMs ?? LINE_MS);
  const read = answering(state, reader(options, state));
  const open = (): void => {
    const s = connect(port, host);
    socket = s;
    let silent = 0;
    const watchdog = setInterval(() => {
      if (silent >= 3) s.destroy();
      else s.write(line("PING", ["gnoworld"]));
      silent += 1;
    }, pingMs);
    s.on("connect", () => {
      greet(s);
    });
    const take = splitter(s, read, log);
    s.on("data", (chunk: Buffer) => {
      silent = 0;
      take(chunk);
    });
    // The close that follows reconnects.
    s.on("error", () => {
      s.destroy();
    });
    s.on("close", () => {
      clearInterval(watchdog);
      forget(state);
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
        sentOn(state, command, params);
        return true;
      } catch {
        return false;
      }
    },
    state: (room) => {
      const s = socket;
      // A room by the JOIN's form: one room, a name no line breaks.
      if (!state.ready || s === undefined || !allowed("JOIN", [room])) return Promise.resolve(undefined);
      return state.states.ask((command, params) => s.write(line(command, params)), room);
    },
    line: (room, msgid) => {
      const s = socket;
      // A room by the JOIN's form, one the link is in: a word that would break a line is never sent.
      if (!state.ready || s === undefined || !allowed("JOIN", [room]) || !state.joined.has(room))
        return Promise.resolve("unanswered");
      return state.lines.ask((command, params) => s.write(line(command, params)), room, msgid);
    },
    relay: relayer(state, () => socket, options.relayMs ?? RELAY_MS),
    relaying: () => state.relays.size,
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

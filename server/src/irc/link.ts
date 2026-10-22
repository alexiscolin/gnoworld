// The server's IRC link (slice 3's plan, 3h): one TCP connection to Ergo's internal listener, as its
// operator, in every room. It reads the rooms' messages, never a direct one, and sends only the commands
// written here, each through formatLine. It comes back after a close, and after three unanswered pings.
import { connect, type Socket } from "node:net";
import { formatLine, parseLine, toIrcCommand, type IrcMessage } from "@gnoworld/core";
import type { Log } from "../log.ts";

/** A room's message, as Ergo marked it: the account it set, and the message's id. */
export interface Said {
  room: string;
  account: string;
  msgid: string;
  text: string;
}

export interface Link {
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
}

const NICK = "gnoworld";
// A server's longest line: 8191 bytes of tags with the @ and the space, 510 more, then CR LF.
const LINE_MAX = 8191 + 512;

/** From a second to a minute, doubling, and half of it either way, so a restart is no storm. */
export function retryDelay(attempt: number, random: () => number = Math.random): number {
  return Math.floor(Math.min(1000 * 2 ** attempt, 60_000) * (0.5 + random()));
}

function line(name: string, params: readonly string[]): string {
  const command = toIrcCommand(name);
  if (command === undefined) throw new RangeError(`link: ${name} is no command`);
  return `${formatLine({ tags: new Map(), command, params })}\r\n`;
}

// The JOIN lines for these rooms, 510 bytes each at most; a name that would break a line is left out.
function joins(rooms: readonly string[]): string[] {
  const lines: string[][] = [];
  for (const room of rooms.filter((name) => /^#[^\s,\0-\x1f]+$/.test(name))) {
    const last = lines.at(-1);
    if (last !== undefined && Buffer.byteLength(`JOIN ${[...last, room].join(",")}`) <= 510) last.push(room);
    else lines.push([room]);
  }
  return lines.map((names) => line("JOIN", [names.join(",")]));
}

// A room's message as the link hands it on, or nothing: a channel line of one of its rooms, with the
// account and the id Ergo set, from someone else, with text.
function said(
  { tags, source, params: [room = "", text = ""] }: IrcMessage,
  joined: ReadonlySet<string>,
): Said | undefined {
  const [account = "", msgid = ""] = [tags.get("account"), tags.get("msgid")];
  const fields = [text, account, msgid];
  if (fields.includes("") || source?.split("!")[0] === NICK || !joined.has(room)) return undefined;
  return { room, account, msgid, text };
}

// The lines Ergo sends that ask for an answer, as 3b's table found them.
function reader(options: Options, state: { attempt: number; joined: Set<string> }) {
  const { password, rooms, onMessage, log } = options;
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
      state.attempt = 0;
      const names = rooms();
      state.joined = new Set(names);
      for (const join of joins(names)) s.write(join);
      log("irc_ready");
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
  const state = { attempt: 0, joined: new Set<string>() };
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
      s.write(line("CAP", ["REQ", "message-tags account-tag"]));
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
        if (parsed.ok) read(s, parsed.message);
      }
      if (held.length > LINE_MAX) s.destroy();
    });
    // The close that follows reconnects.
    s.on("error", () => {
      s.destroy();
    });
    s.on("close", () => {
      clearInterval(watchdog);
      if (stopped) return;
      log("irc_closed");
      retry = setTimeout(open, retryMs(state.attempt));
      state.attempt += 1;
    });
  };
  open();

  return {
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

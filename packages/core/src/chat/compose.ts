// What the composer sends (slice 4's 4c): a draft as the room's IRC line, one PRIVMSG; `/me` sends an action, `//`
// a slash of text, and any other `/word` is a command it does not know, sent nowhere. IRC's line holds 510 bytes,
// counted as Ergo relays it, under its sender's name, and no control character: each one but a break is a space, so
// a draft forges no CTCP of its own. A draft of several lines is one message of lines (draft/multiline, docs/
// decisions.md row 255), each line a PRIVMSG within that budget, the message within Ergo's caps; an action stays one
// line, its breaks spaces.
import { bytes } from "../irc/irc.ts";
import { MULTILINE_BYTES, MULTILINE_LINES } from "../irc/multiline.ts";

export { MULTILINE_BYTES, MULTILINE_LINES } from "../irc/multiline.ts";

/** The bytes of an IRC line after its tags: RFC 1459's 512, less CR LF. */
export const LINE_BYTES = 510;
// Ergo's cloak of a host: 64 bits in base32, then the network's name (deploy/ergo/ircd.yaml.tmpl, ip-cloaking).
const CLOAK = "x".repeat(13) + ".gnoworld";

/**
 * The bytes Ergo puts before a line it relays: `:nick!~u@cloak `, `u` being the user the page registers
 * (lib/ergo/handshake.ts). Ergo refuses a line that would pass 510 with them (417: allow-truncation is off), so the
 * composer counts them; server/src/testing/ergo.test.ts holds Ergo to this count.
 */
export function relayOf(nick: string): number {
  return bytes(`:${nick}!~u@${CLOAK} `);
}

/** The commands a draft may lead with: `/me` sends an action. */
export const COMMANDS: readonly string[] = ["/me"];

/** A draft, composed: the line to send, the bytes it leaves and its text as the room reads it (an action's words,
 * the action said apart), or a message's lines, the bytes it leaves and its text; or why there is none: a line long
 * by `over` bytes (the line of several named, from 1), or a message past a cap. */
export type Composed =
  | { kind: "line"; line: string; left: number; text: string; action: boolean }
  | { kind: "lines"; lines: string[]; left: number; text: string }
  | { kind: "empty" }
  | { kind: "unknown"; command: string }
  | { kind: "long"; over: number; line?: number }
  | { kind: "tooBig"; unit: "lines" | "bytes"; over: number };

/** The line `nick`'s draft sends to `room`, a room id the caller checked. */
export function compose(room: string, draft: string, nick: string): Composed {
  const text = draft
    .replaceAll(/\r\n?/gu, "\n")
    .replaceAll(/(?!\n)\p{Cc}/gu, " ")
    .trim();
  const word = /^\/\S*/u.exec(text)?.[0];
  if (word === undefined) return said(room, nick, { text, action: false });
  if (word.startsWith("//")) return said(room, nick, { text: text.slice(1), action: false });
  const command = word.toLowerCase();
  if (command !== "/me") return { kind: "unknown", command };
  return said(room, nick, { text: text.slice(command.length).replaceAll("\n", " ").trim(), action: true });
}

function said(room: string, nick: string, { text, action }: { text: string; action: boolean }): Composed {
  if (text === "") return { kind: "empty" };
  if (text.includes("\n")) return several(room, nick, text);
  const line = `PRIVMSG ${room} :${action ? `\u0001ACTION ${text}\u0001` : text}`;
  const left = LINE_BYTES - relayOf(nick) - bytes(line);
  return left < 0 ? { kind: "long", over: -left } : { kind: "line", line, left, text, action };
}

// A draft of several lines, each line's end trimmed (a line of spaces alone is blank): the message within Ergo's caps
// first, its blank lines counted as Ergo counts them, then each line within one IRC line's budget.
function several(room: string, nick: string, draft: string): Composed {
  const text = draft
    .split("\n")
    .map((line) => line.trimEnd())
    .join("\n");
  const lines = text.split("\n").map((line) => `PRIVMSG ${room} :${line}`);
  const left = MULTILINE_BYTES - bytes(text);
  if (lines.length > MULTILINE_LINES) return { kind: "tooBig", unit: "lines", over: lines.length - MULTILINE_LINES };
  if (left < 0) return { kind: "tooBig", unit: "bytes", over: -left };
  const budget = LINE_BYTES - relayOf(nick);
  for (const [at, line] of lines.entries()) {
    if (bytes(line) > budget) return { kind: "long", over: bytes(line) - budget, line: at + 1 };
  }
  return { kind: "lines", lines, left, text };
}

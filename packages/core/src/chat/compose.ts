// What the composer sends (slice 4's 4c): a draft as the room's IRC line, one PRIVMSG; `/me` sends an action, `//`
// a slash of text, and any other `/word` is a command it does not know, sent nowhere. IRC's line holds 510 bytes,
// counted as Ergo relays it, under its sender's name, and no control character: each one is a space, so a draft
// holds no break and forges no CTCP of its own.
import { bytes } from "../irc/irc.ts";

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

/** A draft, composed: the line to send and the bytes it leaves, or why there is none. */
export type Composed =
  | { kind: "line"; line: string; left: number }
  | { kind: "empty" }
  | { kind: "unknown"; command: string }
  | { kind: "long"; over: number };

/** The line `nick`'s draft sends to `room`, a room id the caller checked. */
export function compose(room: string, draft: string, nick: string): Composed {
  const text = draft.replaceAll(/\p{Cc}/gu, " ").trim();
  const word = /^\/\S*/u.exec(text)?.[0];
  if (word === undefined) return said(room, nick, text);
  if (word.startsWith("//")) return said(room, nick, text.slice(1));
  const command = word.toLowerCase();
  if (command !== "/me") return { kind: "unknown", command };
  const action = text.slice(command.length).trim();
  return action === "" ? { kind: "empty" } : said(room, nick, `\u0001ACTION ${action}\u0001`);
}

function said(room: string, nick: string, text: string): Composed {
  if (text === "") return { kind: "empty" };
  const line = `PRIVMSG ${room} :${text}`;
  const left = LINE_BYTES - relayOf(nick) - bytes(line);
  return left < 0 ? { kind: "long", over: -left } : { kind: "line", line, left };
}

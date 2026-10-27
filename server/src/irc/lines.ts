// The lines the server's IRC link writes and reads (slice 3's plan, 3h, 3j, 3k): each through formatLine;
// the commands the bot may send, each in its only forms; a room's message as the link hands it on.
import { formatLine, toIrcCommand, type IrcMessage } from "@gnoworld/core";

/** A room's message, as Ergo marked it: the account it set, the message's id and its time, and the id
 * of the line it corrects when it is an edit. */
export interface Said {
  room: string;
  account: string;
  msgid: string;
  text: string;
  time?: string;
  edits?: string;
  /** A message of several lines the link could not read whole: hidden by this id, whatever its text says. */
  unreadable?: true;
}

export type Command = "REDACT" | "NOTICE" | "SAMODE" | "JOIN" | "KICK";

export const NICK = "gnoworld";

// One room, 64 characters at most (Ergo's channellen), no space, comma or control character.
const ROOM = /^#[^\s,\0-\x1f\x7f]{1,63}$/;
// One nick or account by name, never the bot: no wildcard, list, space or control character.
const person = (who: string): boolean =>
  /^[^\s,*?!@#:\0-\x1f\x7f][^\s,*?!@\0-\x1f\x7f]{0,63}$/.test(who) && who !== NICK;

// A room's mode in its only forms: a reconciler's flag (M, m, s, i, R) on or off; a mute on one account by
// name (a wildcard would mute others); an invite of one account, taken off by any mask; a voice given or
// taken; a power above it taken from one person, never the bot; the bot's own op, before a KICK.
function roomMode([room = "", mode = "", arg, ...more]: readonly string[]): boolean {
  if (!ROOM.test(room) || more.length > 0) return false;
  if (arg === undefined) return /^[+-][MmisR]$/.test(mode);
  if (/^[+-]b$/.test(mode)) return /^m:[A-Za-z0-9_-]{1,64}$/.test(arg);
  if (mode === "-I") return /^[^\s,\0-\x1f\x7f]{1,128}$/.test(arg);
  if (mode === "+o") return arg === NICK;
  return /^(?:[+-][Iv]|-[qaoh])$/.test(mode) && person(arg);
}

// A REDACT in one room; a NOTICE to one account, by Ergo's shape of a name (letters, digits, - and _: F655); a
// room's mode (roomMode); a JOIN of one room; a KICK of one person, never the bot, from one room, with its reason
// (3m). Another command has no form.
const FORMS = new Map<string, (params: readonly string[]) => boolean>(
  Object.entries({
    REDACT: ([room = ""]: readonly string[]) => ROOM.test(room),
    NOTICE: ([to = ""]: readonly string[]) => /^[A-Za-z0-9_-]{1,64}$/.test(to),
    SAMODE: roomMode,
    JOIN: ([room = "", ...more]: readonly string[]) => ROOM.test(room) && more.length === 0,
    KICK: ([room = "", who = "", reason = "", ...more]: readonly string[]) =>
      ROOM.test(room) && person(who) && reason !== "" && more.length === 0,
  }),
);

export const allowed = (command: string, params: readonly string[]): boolean => FORMS.get(command)?.(params) === true;

export function line(name: string, params: readonly string[]): string {
  const command = toIrcCommand(name);
  if (command === undefined) throw new RangeError(`link: ${name} is no command`);
  return `${formatLine({ tags: new Map(), command, params })}\r\n`;
}

// The JOIN lines for these rooms, 510 bytes each at most; a name that would break a line, or fill one
// alone, is left out.
export function joins(rooms: readonly string[]): string[] {
  const lines: string[][] = [];
  const fits = (name: string): boolean => /^#[^\s,\0-\x1f]+$/.test(name) && Buffer.byteLength(`JOIN ${name}`) <= 510;
  for (const room of rooms.filter(fits)) {
    const last = lines.at(-1);
    if (last !== undefined && Buffer.byteLength(`JOIN ${[...last, room].join(",")}`) <= 510) last.push(room);
    else lines.push([room]);
  }
  return lines.map((names) => line("JOIN", [names.join(",")]));
}

// Ergo's time, in server-time's form alone, so a mark is always a time Ergo can read back; and the id an
// edit names (+gnoworld/edit, 3b's table), 128 characters at most, or the line is no edit.
function marks(tags: IrcMessage["tags"]): { time?: string; edits?: string } {
  const [time = "", edits = ""] = [tags.get("time"), tags.get("+gnoworld/edit")];
  return {
    ...(/^\d{4}-\d\d-\d\dT\d\d:\d\d:\d\d\.\d{3}Z$/.test(time) ? { time } : {}),
    ...(edits.length > 0 && edits.length <= 128 ? { edits } : {}),
  };
}

// A room's message as the link hands it on, or nothing: a channel line of one of its rooms, with the
// account and the id Ergo set, from someone else, with text.
export function said(
  { tags, source, params: [room = "", text = ""] }: IrcMessage,
  joined: ReadonlySet<string>,
): Said | undefined {
  const [account = "", msgid = ""] = [tags.get("account"), tags.get("msgid")];
  const fields = [text, account, msgid];
  if (fields.includes("") || source?.split("!")[0] === NICK || !joined.has(room)) return undefined;
  return { room, account, msgid, text, ...marks(tags) };
}

// A line of a history page, counted there with its time, which the page's next asking starts from. A time Date
// cannot read is no page's end (F552): the next page starts from the last one read.
export function countInPage(page: { lines: number; last: string } | undefined, { tags }: IrcMessage): void {
  if (page === undefined) return;
  page.lines += 1;
  const time = tags.get("time") ?? "";
  if (!Number.isNaN(Date.parse(time))) page.last = time;
}

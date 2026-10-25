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
}

export type Command = "REDACT" | "NOTICE" | "SAMODE";

export const NICK = "gnoworld";

const ROOM = /^#[^\s,]+$/;
// A REDACT in one room; a NOTICE to one account, never a room, a list or words; a mute put on or taken
// off one account, by name, in one room: no wildcard, which would mute others. Another command has no form.
const FORMS = new Map<string, (params: readonly string[]) => boolean>(
  Object.entries({
    REDACT: ([room = ""]: readonly string[]) => ROOM.test(room),
    NOTICE: ([to = ""]: readonly string[]) => /^[^#,:\s\0-\x1f][^,\s\0-\x1f]*$/.test(to),
    SAMODE: ([room = "", mode = "", mask = "", ...more]: readonly string[]) =>
      ROOM.test(room) && /^[+-]b$/.test(mode) && /^m:[A-Za-z0-9_-]{1,64}$/.test(mask) && more.length === 0,
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

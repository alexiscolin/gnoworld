// The lines the server's IRC link writes and reads (slice 3's plan, 3h, 3j, 3k): each through formatLine;
// the commands the bot may send, each in its only forms; a room's message as the link hands it on.
import { formatLine, GUEST_PREFIX, isCountryCode, toIrcCommand, type IrcMessage } from "@gnoworld/core";

/** A room's message, as Ergo marked it: the account it set, the message's id and its time, and the id
 * of the line it corrects when it is an edit. */
export interface Said {
  room: string;
  account: string;
  msgid: string;
  text: string;
  time?: string;
  edits?: string;
  /** The country its speaker declares (+gnoworld/country, two capitals, ADR-0001 §7): opt-in, never guessed; none when it declares none. */
  country?: string;
  /** A message of several lines the link could not read whole: hidden by this id, whatever its text says. */
  unreadable?: true;
  /** A line to the room's operators or voices alone (@#room, +#room): moderated, never handed to the whole room. */
  few?: true;
}

export type Command = "REDACT" | "NOTICE" | "SAMODE" | "JOIN" | "KICK" | "RELAYMSG";

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

// A guest's line by RELAYMSG (D430): a room, a nick only the server builds (anon/ and two words and four base32 characters, 32
// at most), a text of one line with no control character (a CTCP's \x01 would be relayed as it is), the whole line within the
// 510 bytes of IRC. The room and the text are never the guest's to shape beyond that.
const guestNick = (nick: string): boolean =>
  new RegExp(`^${GUEST_PREFIX}[a-z]{2,10}-[a-z]{2,10}-[a-z2-7]{4}$`).test(nick) && nick.length <= 32;
const oneLine = (text: string): boolean => text.trim() !== "" && text.isWellFormed() && !/[\0-\x1f\x7f]/.test(text);

function relayForm([room = "", nick = "", text = "", ...more]: readonly string[]): boolean {
  return (
    ROOM.test(room) &&
    guestNick(nick) &&
    oneLine(text) &&
    more.length === 0 &&
    Buffer.byteLength(`RELAYMSG ${room} ${nick} :${text}`) <= 510
  );
}

// A REDACT in one room; a NOTICE to one account, by Ergo's shape of a name (letters, digits, - and _: F655); a
// room's mode (roomMode); a JOIN of one room; a KICK of one person, never the bot, from one room, with its reason
// (3m). Another command has no form.
const FORMS = new Map<string, (params: readonly string[]) => boolean>(
  Object.entries({
    REDACT: ([room = ""]: readonly string[]) => ROOM.test(room),
    NOTICE: ([to = ""]: readonly string[]) => /^[A-Za-z0-9_-]{1,64}$/.test(to),
    SAMODE: roomMode,
    RELAYMSG: relayForm,
    JOIN: ([room = "", ...more]: readonly string[]) => ROOM.test(room) && more.length === 0,
    KICK: ([room = "", who = "", reason = "", ...more]: readonly string[]) =>
      ROOM.test(room) && person(who) && reason !== "" && more.length === 0,
  }),
);

export const allowed = (command: string, params: readonly string[]): boolean => FORMS.get(command)?.(params) === true;

export function line(name: string, params: readonly string[], tags: ReadonlyMap<string, string> = new Map()): string {
  const command = toIrcCommand(name);
  if (command === undefined) throw new RangeError(`link: ${name} is no command`);
  return `${formatLine({ tags, command, params })}\r\n`;
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
function marks(tags: IrcMessage["tags"]): { time?: string; edits?: string; country?: string } {
  const [time = "", edits = "", country = ""] = [
    tags.get("time"),
    tags.get("+gnoworld/edit"),
    tags.get("+gnoworld/country"),
  ];
  return {
    ...(/^\d{4}-\d\d-\d\dT\d\d:\d\d:\d\d\.\d{3}Z$/.test(time) ? { time } : {}),
    ...(edits.length > 0 && edits.length <= 128 ? { edits } : {}),
    // Any client may write anything there: two capitals, or none (core's chat/room.ts reads it the same way).
    ...(isCountryCode(country) ? { country } : {}),
  };
}

// A line to a room's voices or operators (STATUSMSG: +#room, @#room, any of ~&@%+ before the name) is the room's
// line too: Ergo relays it to those members and keeps no history of it (channel.go, #959), so it is read for the
// rules, the check and the strikes, and its hide is refused (F723).
const STATUS = /^[~&@%+]+(?=#)/;

// The bot's own line, or a relayed one (D430): said for a guest after the server judged it, so nothing to check, count or hide
// again. A connection can take no nick with the relay's separator, so this holds whatever the tags say.
const sender = (source: string | undefined): string => source?.split("!")[0] ?? "";
const relayed = (source: string | undefined): boolean => sender(source).includes("/");
const ours = (source: string | undefined, answering: boolean): boolean =>
  sender(source) === NICK || (!answering && relayed(source));
// A line's account: the tag Ergo sets, or for a relayed line asked about, the anon nick it was said under.
const accountOf = ({ tags, source }: IrcMessage, answering: boolean): string =>
  answering && relayed(source) ? sender(source) : (tags.get("account") ?? "");

// A room's message as the link hands it on, or nothing: a channel line of one of its rooms, with the
// account and the id Ergo set, from someone else, with text. `answering`: the answer to a question about one line, where a
// relayed guest's line is a line too, its account the anon nick as the relay's own record has it (F13720).
export function said(message: IrcMessage, joined: ReadonlySet<string>, answering = false): Said | undefined {
  const {
    tags,
    source,
    params: [target = "", text = ""],
  } = message;
  const room = target.replace(STATUS, "");
  const [account, msgid] = [accountOf(message, answering), tags.get("msgid") ?? ""];
  if ([text, account, msgid].includes("") || ours(source, answering) || !joined.has(room)) return undefined;
  return { room, account, msgid, text, ...marks(tags), ...(room === target ? {} : { few: true as const }) };
}

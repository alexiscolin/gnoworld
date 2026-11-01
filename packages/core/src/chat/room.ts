// A room as Ergo's lines make it (slice 4's 4b): its lines, in time order, each once and the newest kept;
// who is here; its description, which is its IRC topic (docs/decisions.md, 2026-10-25). Each function
// gives back what it was given when a line changes nothing, so a view need not draw again.
import type { IrcMessage } from "../irc/irc.ts";

/** One line of a room, as Ergo marked it. */
export interface Line {
  /** Ergo's msgid: what a reconnect's history dedupes on, and what a REDACT names. */
  readonly id: string;
  /** Ergo's server-time, in its one form: 2026-10-25T10:00:00.000Z. */
  readonly time: string;
  /** The author's nick, from the line's source. */
  readonly from: string;
  /** The account Ergo vouches for, from its account tag; a guest has none. */
  readonly account?: string;
  readonly text: string;
  readonly kind: "message" | "notice" | "action";
  /** The msgid of the line it answers (4d's replies), a msgid a tag carries; none for a line that answers none. */
  readonly reply?: string;
  /** The msgid of the line it corrects (4d's edits shown, +gnoworld/edit), a msgid a tag carries; none for the rest. */
  readonly edits?: string;
  /** The country its speaker declares (+gnoworld/country, two capitals), never guessed; none for a speaker who declares none. */
  readonly country?: string;
}

// Ergo folds A to Z alone (casemapping ascii, deploy/ergo/ircd.yaml.tmpl), its names being ASCII alone
// (irc/i18n/common.go:74, v2.19.1).
export const fold = (name: string): string => name.replace(/[A-Z]/g, (letter) => letter.toLowerCase());
/** Whether two names, of rooms or nicks, are one name to Ergo. */
export const sameName = (one: string, other: string): boolean => fold(one) === fold(other);
/** The nick of a source: nick!user@host, nick@host, or a nick alone. */
export const nickOf = (source: string): string => source.replace(/[!@].*$/s, "");
const compare = (one: string, other: string): number => (one < other ? -1 : one > other ? 1 : 0);

// Where each command names its room; a QUIT and a NICK name none, every room hearing them.
const PLACES: Readonly<Record<string, number>> = {
  PRIVMSG: 0,
  NOTICE: 0,
  TOPIC: 0,
  JOIN: 0,
  PART: 0,
  KICK: 0,
  REDACT: 0,
  TAGMSG: 0,
  MARKREAD: 0,
  "331": 1,
  "332": 1,
  "353": 2,
};
const EVERYWHERE = ["QUIT", "NICK"];

/** The room a message is about, folded as Ergo folds it; "*" for a QUIT or a NICK, which every room hears; none
 * for the rest. A client reads a line in that room alone. */
export function concerns({ command, params }: IrcMessage): string | undefined {
  if (EVERYWHERE.includes(command)) return "*";
  const place = Object.hasOwn(PLACES, command) ? PLACES[command] : undefined;
  const room = place === undefined ? undefined : params[place];
  return room === undefined ? undefined : fold(room);
}

// A time Ergo writes, on a day that exists: the string reads back as itself.
export function isTime(text: string): boolean {
  if (!/^\d{4}-\d\d-\d\dT\d\d:\d\d:\d\d\.\d{3}Z$/.test(text)) return false;
  const date = new Date(text);
  return !Number.isNaN(date.getTime()) && date.toISOString() === text;
}

// A PRIVMSG's text as a line: an /me (CTCP ACTION, its closing mark optional) is an action; any other
// CTCP is no line. A NOTICE that starts as a CTCP is a CTCP's answer: no line either.
function said(command: string, text: string): Pick<Line, "kind" | "text"> | undefined {
  if (!text.startsWith("\u0001")) return { kind: command === "NOTICE" ? "notice" : "message", text };
  const action = /^ACTION (.+)$/s.exec(text.slice(1).replace(/\u0001$/, ""))?.[1];
  return command === "PRIVMSG" && action !== undefined ? { kind: "action", text: action } : undefined;
}

/** Whether `value` is a msgid a tag carries back: one word of 64 characters at most, no leading colon, nothing a tag
 * escapes, no control character (a NUL, a break or a bell), which no line holds. */
export function isTagMsgid(value: string): boolean {
  return /^[^\s,:;\\\p{Cc}][^\s,;\\\p{Cc}]{0,63}$/u.test(value);
}
/** The line a message answers: +reply, ratified in 2026, before its draft name. */
export const REPLY = ["+reply", "+draft/reply"];
// The line a message corrects: our own tag, no IRCv3 one existing (docs/decisions.md, 2026-10-21).
const EDIT = ["+gnoworld/edit"];
// The speaker's country, a client's tag (ADR-0001 §7): any client may write anything there, so it is two capitals or none.
const COUNTRY = ["+gnoworld/country"];
const isCountryCode = (value: string): boolean => /^[A-Z]{2}$/.test(value);

/** The first of these tags whose value `fits`, or none. */
export function first(
  tags: IrcMessage["tags"],
  names: readonly string[],
  fits: (value: string) => boolean,
): string | undefined {
  return names.map((name) => tags.get(name) ?? "").find(fits);
}

/** The id and the time Ergo set, each in its one form, or none. */
export function stamp(tags: IrcMessage["tags"]): Pick<Line, "id" | "time"> | undefined {
  const [id = "", time = ""] = [tags.get("msgid"), tags.get("time")];
  return /^[^\s,]+$/.test(id) && isTime(time) ? { id, time } : undefined;
}

// The text a PRIVMSG or a NOTICE sends to this room, or none.
function textTo({ command, params }: IrcMessage, room: string): string | undefined {
  const [target = "", text = ""] = params;
  const sent = (command === "PRIVMSG" || command === "NOTICE") && params.length === 2;
  return sent && sameName(target, room) && text !== "" ? text : undefined;
}

// What a line's client tags mark, none for a tag absent or malformed.
function marked(tags: IrcMessage["tags"]): Pick<Line, "reply" | "edits" | "country"> {
  const [reply, edits, country] = [
    first(tags, REPLY, isTagMsgid),
    first(tags, EDIT, isTagMsgid),
    first(tags, COUNTRY, isCountryCode),
  ];
  return {
    ...(reply === undefined ? {} : { reply }),
    ...(edits === undefined ? {} : { edits }),
    ...(country === undefined ? {} : { country }),
  };
}

/** The room's line a message carries, or none: a PRIVMSG or NOTICE to this room with an id, a time and a
 * text; a private message, another room's line or a malformed one is none. */
export function lineOf(message: IrcMessage, room: string): Line | undefined {
  const [text, marks, from] = [textTo(message, room), stamp(message.tags), nickOf(message.source ?? "")];
  const body = text === undefined ? undefined : said(message.command, text);
  if (marks === undefined || body === undefined || from === "") return undefined;
  const account = message.tags.get("account") ?? "";
  return { ...marks, from, ...(account === "" ? {} : { account }), ...body, ...marked(message.tags) };
}

// By time alone: JS sorts stably, so lines of one millisecond keep the order they came in (F773).
const byTime = (one: Line, other: Line): number => compare(one.time, other.time);

// A live line, the usual case: one line after every line held, and not one of them, is only appended.
function newest(lines: readonly Line[], incoming: readonly Line[], cap: number): readonly Line[] | undefined {
  const [line] = incoming;
  const last = lines.at(-1);
  if (incoming.length !== 1 || line === undefined || (last !== undefined && byTime(last, line) > 0)) return;
  if (lines.some((each) => each.id === line.id)) return;
  return [...lines.slice(Math.max(0, lines.length - cap + 1)), line];
}

/** The room's lines with these added: in time order, lines of one time in the order they came, each id once, the
 * newest `cap` kept. */
export function addLines(lines: readonly Line[], incoming: readonly Line[], cap: number): readonly Line[] {
  if (!Number.isInteger(cap) || cap < 1) throw new RangeError("addLines: the cap is a whole number, 1 or more");
  const appended = newest(lines, incoming, cap);
  if (appended !== undefined) return appended;
  const held = new Set(lines.map((line) => line.id));
  const added = new Map<string, Line>();
  for (const line of incoming) if (!held.has(line.id) && !added.has(line.id)) added.set(line.id, line);
  if (added.size === 0) return lines;
  const kept = [...lines, ...added.values()].sort(byTime).slice(-cap);
  return kept.some((line) => !held.has(line.id)) ? kept : lines;
}

/** The room's lines, or its reactions, without the one Ergo's REDACT hides (draft/message-redaction). */
export function redactAfter<T extends { readonly id: string }>(
  lines: readonly T[],
  message: IrcMessage,
  room: string,
): readonly T[] {
  const [target = "", id = ""] = message.params;
  if (message.command !== "REDACT" || !sameName(target, room)) return lines;
  const kept = lines.filter((line) => line.id !== id);
  return kept.length === lines.length ? lines : kept;
}

/** The line Ergo refused to delete, from its FAIL REDACT <code> <target> <msgid> :text (irc/handlers.go, v2.19.1): its
 * room, folded, and its msgid; none for any other reply, an INVALID_TARGET, which names no line, among them. */
export function refusedOf({ command, params }: IrcMessage): { room: string; id: string } | undefined {
  const [about, , target = "", id = ""] = params;
  return command === "FAIL" && about === "REDACT" && params.length === 5 ? { room: fold(target), id } : undefined;
}

/** The room I look at, and my nick in it. */
export interface Where {
  readonly room: string;
  readonly me: string;
}

// Names in code-unit order merged into the sorted list, in one pass: a NAMES line costs no sort of the room.
function merged(members: readonly string[], added: readonly string[]): readonly string[] {
  const out: string[] = [];
  let at = 0;
  for (const name of added) {
    let member = members[at];
    while (member !== undefined && compare(member, name) < 0) {
      out.push(member);
      at += 1;
      member = members[at];
    }
    out.push(name);
  }
  return [...out, ...members.slice(at)];
}

// A nick put in its place in a sorted list: a JOIN costs one pass, no sort.
function inserted(members: readonly string[], nick: string): readonly string[] {
  const at = members.findIndex((member) => compare(member, nick) > 0);
  return at === -1 ? [...members, nick] : [...members.slice(0, at), nick, ...members.slice(at)];
}
const without = (members: readonly string[], nick: string): readonly string[] =>
  members.includes(nick) ? members.filter((member) => member !== nick) : members;

type Change = (members: readonly string[], message: IrcMessage, at: Where) => readonly string[];

// RPL_NAMREPLY: my nick, the room's symbol, the room, its names; multi-prefix gives each name every mode
// prefix it holds.
const named: Change = (members, { params: [, , room = "", list] }, at) => {
  if (!sameName(room, at.room) || list === undefined) return members;
  const names = list.split(" ").map((name) => name.replace(/^[~&@%+]+/, ""));
  const held = new Set(members);
  const added = [...new Set(names.filter((name) => name !== "" && !held.has(name)))].sort(compare);
  return added.length === 0 ? members : merged(members, added);
};

const joined: Change = (members, { source = "", params: [room = ""] }, at) => {
  const nick = nickOf(source);
  if (!sameName(room, at.room) || nick === "") return members;
  if (nick === at.me) return [at.me];
  return members.includes(nick) ? members : inserted(members, nick);
};

const parted: Change = (members, { source = "", params: [room = ""] }, at) => {
  if (!sameName(room, at.room)) return members;
  return nickOf(source) === at.me ? [] : without(members, nickOf(source));
};

const kicked: Change = (members, { params: [room = "", nick = ""] }, at) => {
  if (!sameName(room, at.room)) return members;
  return nick === at.me ? [] : without(members, nick);
};

const renamed: Change = (members, { source = "", params: [next = ""] }) => {
  const nick = nickOf(source);
  if (next === "" || !members.includes(nick)) return members;
  const rest = without(members, nick);
  return rest.includes(next) ? rest : inserted(rest, next);
};

const CHANGES: Readonly<Record<string, Change>> = {
  "353": named,
  JOIN: joined,
  PART: parted,
  KICK: kicked,
  QUIT: (members, { source = "" }) => without(members, nickOf(source)),
  NICK: renamed,
};

/** Who is here once this message is read, by nick, sorted in code-unit order. My own JOIN starts the list
 * again, NAMES fills it, my PART or my KICK empties it; a replayed line (in a history batch) changes nothing. */
export function membersAfter(members: readonly string[], message: IrcMessage, at: Where): readonly string[] {
  if (message.tags.has("batch")) return members;
  const change = Object.hasOwn(CHANGES, message.command) ? CHANGES[message.command] : undefined;
  return change?.(members, message, at) ?? members;
}

/** The room's description once this message is read: RPL_TOPIC (332) or a TOPIC sets it, an empty one or
 * RPL_NOTOPIC (331) clears it. */
export function topicAfter(topic: string | undefined, message: IrcMessage, room: string): string | undefined {
  const { command, params } = message;
  // 331 and 332 name the room after my nick, TOPIC first.
  const [named = "", text] = params.slice(command === "TOPIC" ? 0 : 1);
  if (!sameName(named, room)) return topic;
  if (command === "331") return undefined;
  if ((command === "332" || command === "TOPIC") && text !== undefined) return text || undefined;
  return topic;
}

export { isCountryCode };

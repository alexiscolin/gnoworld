// A room's reading place (slice 4's 4f): the time of the last line the account read there, which Ergo keeps for it
// and tells each of its sessions (draft/read-marker, ircv3.net/specs/extensions/read-marker; irc/handlers.go v2.19.1),
// and the line marked New while the room is open: the first past the place when the room opened.
import type { IrcMessage } from "../irc/irc.ts";
import { isTime, sameName, type Line } from "./room.ts";

/** How far past the page's clock a place may stand: past it, the place is no place (a clock's skew allowed). */
export const PLACE_AHEAD_MS = 5 * 60_000;

// Ergo's own word: a server's source, a name with no user and no host, or none.
const fromServer = (source: string | undefined): boolean => source === undefined || !/[!@]/.test(source);

// The time Ergo's MARKREAD for the room gives, in its one form, at most 5 minutes past `now`; none for `*`, for
// another message, a replayed one or a person's.
function placeOf({ command, params, tags, source }: IrcMessage, room: string, now: number): string | undefined {
  if (command !== "MARKREAD") return undefined;
  const [target = "", stamp = ""] = params;
  const ergo = sameName(target, room) && !tags.has("batch") && fromServer(source);
  const time = ergo && stamp.startsWith("timestamp=") ? stamp.slice("timestamp=".length) : "";
  return isTime(time) && Date.parse(time) <= now + PLACE_AHEAD_MS ? time : undefined;
}

/** The room's reading place once this message is read at `at.now` (ms): Ergo's MARKREAD for the room gives the time it
 * holds, in its one form, `*` none; the place only moves forward, and one more than 5 minutes past the clock is none.
 * A replayed one or a person's changes nothing. */
export function readAfter(
  read: string | undefined,
  message: IrcMessage,
  at: { readonly room: string; readonly now: number },
): string | undefined {
  const time = placeOf(message, at.room, at.now);
  return time !== undefined && (read === undefined || time > read) ? time : read;
}

/** The msgid of the first line past `read`, the reader's own lines passed (an author is its account tag alone); none
 * with no place known, or every line read. */
export function firstUnread(lines: readonly Line[], read: string | undefined, me: string): string | undefined {
  if (read === undefined) return undefined;
  return lines.find((line) => line.time > read && line.account !== me)?.id;
}

/** The line marked New while a room is open: none decided while the room holds no line or no place is known;
 * then the first line past the place, kept as it is until the room closes, but for a place the reader asks to go back
 * to (4d: Mark unread), `unread`, the device's place the mark was last decided from. */
export type NewMark = { readonly id: string | undefined; readonly unread?: string | undefined } | undefined;

/** The reading place that leaves the line at `time` and all after it unread: the millisecond before it, in Ergo's one
 * form; none for a time that is not one, or one with no millisecond before it. */
export function placeBefore(time: string): string | undefined {
  if (!isTime(time)) return undefined;
  const place = new Date(Date.parse(time) - 1).toISOString();
  return isTime(place) ? place : undefined;
}

/** The place a room's New mark is decided from: the earlier of Ergo's, which only moves forward (MARKREAD cannot go
 * back: irc/getters.go:552, v2.19.1), and the device's, which a reader asked to go back to; none when neither is known. */
export function placeFrom(read: string | undefined, unread: string | undefined): string | undefined {
  return read === undefined || (unread !== undefined && unread < read) ? unread : read;
}

/** The New mark once the room holds `lines`: decided once from `placeFrom(read, unread)`, then the same, until the device
 * is given another place, which moves it (forward or back); a place cleared, or given again, keeps it. */
export function newMarkAfter(
  mark: NewMark,
  {
    lines,
    read,
    unread,
  }: { readonly lines: readonly Line[]; readonly read: string | undefined; readonly unread?: string | undefined },
  me: string,
): NewMark {
  if (mark === undefined ? lines.length === 0 : unread === undefined || unread === mark.unread) return mark;
  const place = placeFrom(read, unread);
  if (place === undefined) return mark;
  return { id: firstUnread(lines, place, me), ...(unread === undefined ? {} : { unread }) };
}

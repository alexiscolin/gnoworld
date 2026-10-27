// A room's reading place (slice 4's 4f): the time of the last line the account read there, which Ergo keeps for it
// and tells each of its sessions (draft/read-marker, ircv3.net/specs/extensions/read-marker; irc/handlers.go v2.19.1),
// and the line marked New while the room is open: the first past the place when the room opened.
import type { IrcMessage } from "../irc/irc.ts";
import { isTime, sameRoom, type Line } from "./room.ts";

/** How far past the page's clock a place may stand: past it, the place is no place (a clock's skew allowed). */
export const PLACE_AHEAD_MS = 5 * 60_000;

// Ergo's own word: a server's source, a name with no user and no host, or none.
const fromServer = (source: string | undefined): boolean => source === undefined || !/[!@]/.test(source);

// The time Ergo's MARKREAD for the room gives, in its one form, at most 5 minutes past `now`; none for `*`, for
// another message, a replayed one or a person's.
function placeOf({ command, params, tags, source }: IrcMessage, room: string, now: number): string | undefined {
  if (command !== "MARKREAD") return undefined;
  const [target = "", stamp = ""] = params;
  const ergo = sameRoom(target, room) && !tags.has("batch") && fromServer(source);
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

/** The line marked New while a room is open: none decided while the room holds no line or its place is unknown;
 * then the first line past the place, or none, kept as it is until the room closes. */
export type NewMark = { readonly id: string | undefined } | undefined;

/** The New mark once the room holds `lines` and its place is `read`: decided once, then the same. */
export function newMarkAfter(
  mark: NewMark,
  { lines, read }: { readonly lines: readonly Line[]; readonly read: string | undefined },
  me: string,
): NewMark {
  if (mark !== undefined || read === undefined || lines.length === 0) return mark;
  return { id: firstUnread(lines, read, me) };
}

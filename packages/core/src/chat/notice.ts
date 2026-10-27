// What a line is to its reader (slice 4's 4f-n): a notice, which the page tells the account of and counts unseen, or
// none. An account's alone, in a room it follows or in a direct message; never its own line, a NOTICE (a bot's or a
// server's) or an edit, a line already counted when it came. One notice a line, in this order: a mention of the account,
// a reply to one of its lines, a mention of the whole room where that counts.
import { markdown } from "../markdown/markdown.ts";
import { mentions, mentionsRoom } from "../markdown/mentions.ts";
import type { Line } from "./room.ts";

/** What a line is to its reader: a mention of them, a mention of the whole room, a reply to them, a direct message. */
export type NoticeKind = "mention" | "group" | "reply" | "dm";
/** What a room tells its reader of: every line, the mentions and replies, or nothing, mentions included. */
export type NoticeMode = "all" | "mentions" | "none";
export const DEFAULT_MODE: NoticeMode = "mentions";

export interface Notice {
  /** The line's msgid. */
  readonly id: string;
  readonly kind: NoticeKind;
  /** The room's id, or a conversation's partner. */
  readonly where: string;
  readonly time: string;
  /** The author: its account, a guest's nick. */
  readonly by: string;
}

/** A line, with the msgid it answers or corrects when it does (4d). */
export type NoticeLine = Line;

/** What the reader is, and holds, in the room a line came to. */
export interface RoomAt {
  /** The reader's address; none for a guest. */
  readonly me: string | undefined;
  readonly mode: NoticeMode;
  /** The room's lines held, which a reply's target is looked for in. */
  readonly held: readonly NoticeLine[];
  /** Whether a mention of the whole room counts here (decisions, 2026-10-27, N3). */
  readonly groups: boolean;
}

const made = (line: Line, kind: NoticeKind, where: string): Notice => ({
  id: line.id,
  kind,
  where,
  time: line.time,
  by: line.account ?? line.from,
});

// A line that is none of its reader's whatever it says: in a room set to none, a NOTICE, an edit, the reader's own.
const quiet = (line: Line, mode: NoticeMode, me: string): boolean =>
  mode === "none" || line.kind === "notice" || line.edits !== undefined || line.account === me;

const repliesTo = (line: Line, held: readonly Line[], me: string): boolean =>
  line.reply !== undefined && held.some((each) => each.id === line.reply && each.account === me);

/** The notice a room's line is for its reader, or none. */
export function roomNotice(line: NoticeLine, room: string, at: RoomAt): Notice | undefined {
  const { me, mode, held, groups } = at;
  if (me === undefined || quiet(line, mode, me)) return undefined;
  const tree = markdown(line.text);
  if (mentions(tree).includes(me)) return made(line, "mention", room);
  if (repliesTo(line, held, me)) return made(line, "reply", room);
  return groups && mentionsRoom(tree) ? made(line, "group", room) : undefined;
}

/** The notice a direct message is for its reader, or none: the partner's own, never a NOTICE. */
export function dmNotice(dm: { partner: string; line: Line }, me: string | undefined): Notice | undefined {
  const { partner, line } = dm;
  return me === undefined || line.account === me || line.kind === "notice" ? undefined : made(line, "dm", partner);
}

// What a line is to its reader: a notice, which the page tells the account of and counts unseen, or
// none. An account's alone, in a room it follows or in a direct message; never its own line, a NOTICE (a bot's or a
// server's) or an edit, a line already counted when it came. One notice a line, in this order: a mention of the account,
// a reply in a thread it started or answered in, a mention of the whole room where that counts.
import { fold } from "./fold.ts";
import type { NoticeMode } from "./noticeModes.ts";
import { markdown } from "../markdown/markdown.ts";
import { mentions, mentionsRoom } from "../markdown/mentions.ts";
import type { Line } from "./room.ts";
import { threadsOf } from "./threads.ts";

/** What a line is to its reader: a mention of them, a mention of the whole room, a reply in their thread, a direct message. */
type NoticeKind = "mention" | "group" | "reply" | "dm";

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

/** A line, with the msgid it answers or corrects when it does. */
export type NoticeLine = Line;

/** What the reader is, and holds, in the room a line came to. */
export interface RoomAt {
  /** The reader's address; none for a guest. */
  readonly me: string | undefined;
  readonly mode: NoticeMode;
  /** The room's lines held, which a reply's target is looked for in. */
  readonly held: readonly NoticeLine[];
  /** Whether a mention of the whole room counts here. */
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

// A reply in a thread the reader is in: the line it answers, or the root and every reply of that line's thread (threads.ts), holds
// one of theirs. Read only for a line that replies, against the room's lines held.
function repliesTo(line: Line, held: readonly Line[], me: string): boolean {
  if (line.reply === undefined) return false;
  const { rootOf } = threadsOf(held);
  const root = rootOf.get(line.reply) ?? line.reply;
  return held.some((each) => each.account === me && (each.id === root || rootOf.get(each.id) === root));
}

/** Whether a text may mention anyone: most lines hold no @, and need no parsing. */
export const hasAt = (text: string): boolean => text.includes("@") || fold(text).includes("@");

/** The notice a room's line is for its reader, or none. */
export function roomNotice(line: NoticeLine, room: string, at: RoomAt): Notice | undefined {
  const { me, mode, held, groups } = at;
  if (me === undefined || quiet(line, mode, me)) return undefined;
  // A mention needs an @ (a full-width one folds to it, as the count reads @room), and a reply is told by its tag: most
  // lines are neither, and are not parsed.
  if (line.reply === undefined && !hasAt(line.text)) return undefined;
  const tree = markdown(line.text);
  if (mentions(tree).includes(me)) return made(line, "mention", room);
  if (repliesTo(line, held, me)) return made(line, "reply", room);
  return groups && mentionsRoom(tree) ? made(line, "group", room) : undefined;
}

/** The notice a direct message is for its reader, or none: the partner's own, never a NOTICE or an edit. */
export function dmNotice(dm: { partner: string; line: Line }, me: string | undefined): Notice | undefined {
  const { partner, line } = dm;
  return me === undefined || quiet(line, "all", me) ? undefined : made(line, "dm", partner);
}

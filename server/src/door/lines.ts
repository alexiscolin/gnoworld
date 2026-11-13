// The recent lines of each public room (Alexis, 10g-1): the last 30 lines moderation let through, 8 KiB of text a room,
// 10,000 rooms, in memory alone, so a question to Jarvis carries what was said where it was asked. A line taken from its
// room, or replaced by its author's edit, leaves at once; one taken before moderation let it through never comes in.
import type { Said } from "../irc/link.ts";
import { JARVIS_NICK } from "@gnoworld/core";
import { remember } from "../remember.ts";
import { JARVIS_LINES, type JarvisAsk } from "@gnoworld/schemas";

export interface RecentLines {
  // A line moderation let through: kept if its room is public.
  passed: (said: Said) => void;
  // A line taken from its room: its author's delete or a hide (REDACT).
  taken: (room: string, msgid: string) => void;
  // A line that replaces another (+gnoworld/edit): the replaced one goes if the same account wrote it.
  edited: (said: Said) => void;
  // A room's lines, oldest first, each by a number for who said it, the asker 0.
  recent: (room: string, asker: string) => JarvisAsk["lines"];
  // The id of a room's last line moderation let through, public room or not (D13985, a served answer's key).
  last: (room: string) => string | undefined;
}

interface Options {
  isPublic: (room: string) => boolean;
  // Told the account of each line moderation let through, in any room (D13985, the account's first ask).
  heard?: { said: (account: string) => void } | undefined;
  // Told the room of each line taken or replaced, whose served answers go (D13985).
  changed?: ((room: string) => void) | undefined;
  // Told the room and id of each line taken or replaced, whose kept public answer goes.
  answers?: { drop: (room: string, msgid: string, line?: { account: string; text: string }) => void } | undefined;
}

interface Kept {
  msgid: string;
  account: string;
  text: string;
  time: string | undefined;
  bytes: number;
}

// The answer Jarvis said for a line goes with it. Jarvis's own line is never kept here: its answer goes when it is taken, or edited
// by its nick; another account's edit of a line not kept counts for nothing.
function dropAnswer(
  answers: Options["answers"],
  { room, msgid, by }: { room: string; msgid: string; by: string | null },
  line: Kept | undefined,
): void {
  if (by !== null && line === undefined && by !== JARVIS_NICK) return;
  answers?.drop(room, msgid, line === undefined ? undefined : { account: line.account, text: line.text });
}

const ROOMS = 10_000;
// The lines taken or replaced before they came in, remembered: the oldest forgotten first.
export const GONE = 2000;

export function makeRecentLines({ isPublic, heard, changed, answers }: Options): RecentLines {
  // The Map's first room is the one written longest ago: a room is set again at each line.
  const rooms = new Map<string, { lines: Kept[]; bytes: number }>();
  // The lines gone: a room's line taken (`room id`), or replaced by its author (`room id account`), each its own mark, so
  // no later mark of another kind or account stands for it (F5270, as pins.ts's `replaced`), and a line gone whether it
  // was kept yet or not, so it never comes in or back (F5109).
  const gone = new Map<string, true>();
  const lasts = new Map<string, string>();
  const key = (...parts: string[]): string => parts.join(" ");
  const drop = (room: string, msgid: string, by: string | null): void => {
    const kept = rooms.get(room) ?? { lines: [], bytes: 0 };
    const line = kept.lines.find((each) => each.msgid === msgid);
    // Another account's edit of a line kept replaces nothing, so it drops no answer kept for the room either.
    if (line !== undefined && by !== null && line.account !== by) return;
    changed?.(room);
    remember(gone, [by === null ? key(room, msgid) : key(room, msgid, by), true], GONE);
    dropAnswer(answers, { room, msgid, by }, line);
    if (line === undefined) return;
    kept.lines.splice(kept.lines.indexOf(line), 1);
    kept.bytes -= line.bytes;
  };
  // A public room's line to the whole room, not taken nor replaced by its author before it came, within a room's bytes.
  const live = ({ room, msgid, account, few }: Said): boolean =>
    few === undefined && !gone.has(key(room, msgid)) && !gone.has(key(room, msgid, account));
  const admits = (said: Said): boolean =>
    live(said) && isPublic(said.room) && Buffer.byteLength(said.text) <= JARVIS_LINES.bytes;
  // A line a person said to the room: not one for its operators, an edit, or one gone before it came.
  const noted = (said: Said): void => {
    if (!live(said) || said.edits !== undefined) return;
    heard?.said(said.account);
    remember(lasts, [said.room, said.msgid], ROOMS);
  };
  return {
    passed(said) {
      if (said.account === JARVIS_NICK) return;
      noted(said);
      const kept = rooms.get(said.room) ?? { lines: [], bytes: 0 };
      // A catch-up hands a line again: it is kept once.
      if (!admits(said) || kept.lines.some(({ msgid }) => msgid === said.msgid)) return;
      const { msgid, account, text, time } = said;
      const bytes = Buffer.byteLength(text);
      kept.lines.push({ msgid, account, text, time, bytes });
      kept.bytes += bytes;
      while (kept.lines.length > JARVIS_LINES.lines || kept.bytes > JARVIS_LINES.bytes)
        kept.bytes -= kept.lines.shift()?.bytes ?? 0;
      remember(rooms, [said.room, kept], ROOMS);
    },
    taken: (room, msgid) => {
      drop(room, msgid, null);
    },
    edited({ room, edits, account }) {
      if (edits !== undefined) drop(room, edits, account);
    },
    last: (room) => lasts.get(room),
    recent(room, asker) {
      const speakers = new Map([[asker, 0]]);
      return (rooms.get(room)?.lines ?? []).map(({ account, text, time }) => {
        const speaker = speakers.get(account) ?? speakers.size;
        speakers.set(account, speaker);
        return time === undefined ? { speaker, text } : { speaker, text, time };
      });
    },
  };
}

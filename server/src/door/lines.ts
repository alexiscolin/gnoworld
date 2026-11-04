// The recent lines of each public room (Alexis, 10g-1): the last 30 lines moderation let through, 8 KiB of text a room,
// 10,000 rooms, in memory alone, so a question to Jarvis carries what was said where it was asked. A line taken from its
// room, or replaced by its author's edit, leaves at once; one taken before moderation let it through never comes in.
import type { Said } from "../irc/link.ts";
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
}

interface Kept {
  msgid: string;
  account: string;
  text: string;
  time: string | undefined;
  bytes: number;
}

const ROOMS = 10_000;
// The lines taken or replaced before they came in, remembered: the oldest forgotten first.
const GONE = 2000;

export function makeRecentLines({ isPublic }: { isPublic: (room: string) => boolean }): RecentLines {
  // The Map's first room is the one written longest ago: a room is set again at each line.
  const rooms = new Map<string, { lines: Kept[]; bytes: number }>();
  // The lines gone: a room's line taken (`room id`), or replaced by its author (`room id account`), each its own mark, so
  // no later mark of another kind or account stands for it (F5270, as pins.ts's `replaced`), and a line gone whether it
  // was kept yet or not, so it never comes in or back (F5109).
  const gone = new Map<string, true>();
  const key = (...parts: string[]): string => parts.join(" ");
  const drop = (room: string, msgid: string, by: string | null): void => {
    const kept = rooms.get(room) ?? { lines: [], bytes: 0 };
    const line = kept.lines.find((each) => each.msgid === msgid);
    // Another account's edit of a line kept replaces nothing.
    if (line !== undefined && by !== null && line.account !== by) return;
    remember(gone, [by === null ? key(room, msgid) : key(room, msgid, by), true], GONE);
    if (line === undefined) return;
    kept.lines.splice(kept.lines.indexOf(line), 1);
    kept.bytes -= line.bytes;
  };
  // A public room's line, not taken nor replaced by its author before it came, within a room's bytes.
  const admits = ({ room, msgid, account, text }: Said): boolean =>
    isPublic(room) &&
    !gone.has(key(room, msgid)) &&
    !gone.has(key(room, msgid, account)) &&
    Buffer.byteLength(text) <= JARVIS_LINES.bytes;
  return {
    passed(said) {
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

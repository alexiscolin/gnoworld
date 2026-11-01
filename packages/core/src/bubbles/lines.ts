// A room's lines as the rules read them (7f2): the seam between the store and `pickBubbles`. It decides what a bubble may be made of, so it
// fails shut: a room is public only when its list says so.
import { hasAt } from "../chat/notice.ts";
import type { Line } from "../chat/room.ts";
import { foldEdits } from "../chat/shown.ts";
import { mentions } from "../markdown/mentions.ts";
import { markdown } from "../markdown/markdown.ts";
import type { BubbleMessage } from "./types.ts";

export interface EarthRoom {
  /** Its type as the list of rooms gives it; none while the list holds it not. */
  readonly type: string | undefined;
  readonly lines: readonly Line[];
  /** Whether the moderation hid a line, by msgid. */
  readonly hidden: (id: string) => boolean;
}

/** Whether anyone may read a room: open and announcement rooms, not one an account or an invitation opens. */
export const isPublicRoom = (type: string | undefined): boolean => type === "open" || type === "announcement";

const named = (text: string): readonly string[] => (hasAt(text) ? mentions(markdown(text)) : []);

/** Every room's lines of people's words, each corrected by its newest edit and dated by its own time. `joined` while the link is up: the
 * lines kept while it is down are for reading alone. */
export function bubbleLines(rooms: readonly EarthRoom[], joined: boolean): BubbleMessage[] {
  const read: BubbleMessage[] = [];
  for (const { type, lines, hidden } of rooms) {
    const { shown, newest } = foldEdits(lines);
    for (const line of shown) {
      const at = Date.parse(line.time);
      if (line.kind !== "message" || Number.isNaN(at)) continue;
      read.push({
        id: line.id,
        at,
        account: line.account ?? line.from,
        text: line.text,
        ...(line.country === undefined ? {} : { country: line.country }),
        visibility: isPublicRoom(type) ? "public" : "private",
        joined,
        mentions: named(line.text),
        ...(hidden(newest.get(line.id) ?? line.id) ? { hidden: true } : {}),
      });
    }
  }
  return read;
}

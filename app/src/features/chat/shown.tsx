// The conversation in view on a world's page (slice 4's 4e), one RoomView and one Writer whatever it is: a room's or
// a direct message's, what each is told.
import { Icon } from "@gnoworld/ui";
import { NOT_ENCRYPTED, PAGE_ONLY, type Dms } from "./Dms.tsx";
import { shortAddress } from "./names.ts";
import { roomShown, type Room, type Shown } from "./roomShown.ts";
import styles from "./shown.module.css";

export type { Room, Shown } from "./roomShown.ts";

/** What a direct message's page is told by the page: how it sends, whether its composer takes the focus, and the
 * id of its note, which the composer points at. */
export interface DmPage {
  sayTo: (partner: string, draft: string) => boolean;
  focus: boolean;
  noteId: string;
  /** The conversation seen up to a line's time, as its reader reaches its end (4f-n). */
  seen?: ((partner: string, time: string) => void) | undefined;
}

// A direct message's (4e): said to be one, its partner named, the address whole in its title (U7); not encrypted, by a
// lock and a word in amber, caution's colour (U6); no one beside it; a line Ergo refused said so.
function dmShown(partner: string, dms: Dms, { sayTo, focus, noteId, seen }: DmPage): Shown {
  const short = shortAddress(partner);
  const { refused } = dms;
  const title = (
    <>
      <span className="label">Direct message with</span> <span title={partner}>{short}</span>
    </>
  );
  const note = (
    <>
      <span className={styles["caution"]}>
        <Icon name="lock" /> {NOT_ENCRYPTED}
      </span>{" "}
      {PAGE_ONLY}
    </>
  );
  return {
    kind: "dm",
    key: `dm:${partner}`,
    // Its lines have no bar (4c's bar is a room's: its link, its delete), so nothing deletes or dismisses.
    view: {
      room: undefined,
      title,
      note,
      // Its page is the one it holds, so its reader's reach of the end counts as a read (4f-n).
      state: { lines: dms.lines, members: [], paged: true },
      empty: dms.empty,
      onDelete: () => false,
      onDismiss: () => undefined,
      onRead: (id) => {
        const line = dms.lines.findLast((each) => each.id === id);
        if (line !== undefined) seen?.(partner, line.time);
      },
    },
    writer: {
      room: partner,
      label: short,
      members: [],
      onSay: (draft) => sayTo(partner, draft),
      refused:
        refused === undefined
          ? undefined
          : {
              ...refused,
              why:
                refused.offline === false
                  ? "Not sent: the chat refused this line."
                  : `Not sent: ${short} is not online.`,
            },
      focus,
      describedBy: noteId,
    },
  };
}

/** What is in view: the direct message ?dm= names; else none when ?dm= names none it can show (U9); else the room. */
export function shownOf(dms: Dms, room: Room, page: DmPage): Shown | undefined {
  if (dms.partner !== undefined) return dmShown(dms.partner, dms, page);
  return dms.problem !== undefined || room.id === undefined ? undefined : roomShown(room.id, room.state, room.acts);
}

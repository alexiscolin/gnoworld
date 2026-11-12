// The conversation in view on a world's page (slice 4's 4e), one RoomView and one Writer whatever it is: a room's or
// a direct message's, what each is told.
import { Chip, Cluster, Icon } from "@gnoworld/ui";
import { NOT_ENCRYPTED, PAGE_ONLY, type Dms } from "./Dms.tsx";
import type { DmActs } from "./dmActs.ts";
import type { Say } from "./linkTypes.ts";
import { shortAddress } from "./names.ts";
import { PersonLink } from "./PersonLinkLazy.tsx";
import type { RoomViewProps } from "./RoomView.tsx";
import { roomShown, type Room, type Shown } from "./roomShown.ts";
import styles from "./shown.module.css";

export type { Room, Shown } from "./roomShown.ts";

/** What a direct message's page is told by the page: how it sends, whether its composer takes the focus, and the
 * id of its note, which the composer points at. */
export interface DmPage {
  sayTo: (partner: string, say: Say, tags?: { reply?: string; edit?: string }) => boolean;
  /** The bar's acts, through the link; none in a test that gives none: nothing then goes out. */
  acts?: DmActs | undefined;
  focus: boolean;
  noteId: string;
  /** The conversation seen up to a line's time, as its reader reaches its end (4f-n). */
  seen?: ((partner: string, time: string) => void) | undefined;
}

// The conversation's lines, with the reactions to them and what Ergo refused of the page's acts (4d's DM bar).
const stateOf = (dms: Dms): NonNullable<RoomViewProps["state"]> => ({
  lines: dms.lines,
  members: [],
  paged: true,
  reactions: dms.reactions,
  refused: dms.acts?.deleted,
  cannotReact: dms.acts?.reacted,
});

// A direct message's (4e): said to be one, its partner named, the address whole in its title (U7); not encrypted, by a
// lock and a word in amber, caution's colour (U6); a line Ergo refused said so.
function dmShown(partner: string, dms: Dms, { sayTo, focus, noteId, seen, acts }: DmPage): Shown {
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
    title,
    note,
    mark: (
      <Cluster space="2xs">
        <Chip tone="warm">Not encrypted</Chip>
        <PersonLink address={partner} asIcon="s" />
      </Cluster>
    ),
    // Its lines have the bar (4d's DM bar): a reaction, a reply, an edit and a delete of one's own; no link, no player.
    view: {
      room: undefined,
      partner,
      // Its page is the one it holds, so its reader's reach of the end counts as a read (4f-n).
      state: stateOf(dms),
      empty: dms.empty,
      onDelete: acts?.onDelete ?? (() => false),
      onDismiss: acts?.onDismiss ?? (() => undefined),
      onReact: acts?.onReact ?? (() => false),
      onRead: (id) => {
        const line = dms.lines.findLast((each) => each.id === id);
        if (line !== undefined) seen?.(partner, line.time);
      },
    },
    say: (composed, draft, tags) => sayTo(partner, { composed, draft }, tags),
    writer: {
      room: partner,
      label: short,
      members: [],
      onSay: (composed, draft) => sayTo(partner, { composed, draft }),
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

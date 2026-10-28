// A room's lines (slice 4's 4b, moved out of RoomView.tsx): the newest the store holds (the window), held at the
// newest while the reader is there; a line's text is Markdown (4c), built into elements from an allowlist
// (Message.tsx); one that mentions the reader says so (4d). The message menu (4c, docs/decisions.md 2026-10-26): the
// list is one tab stop, a line, the arrows moving among them; a line pointed at or focused shows its bar.
import {
  foldEdits,
  reactionsOn,
  threadsOf,
  type Line,
  type Reacting,
  type Reaction,
  type Shown,
  type ShownLine,
} from "@gnoworld/core";
import type { StreamEvent } from "@gnoworld/schemas";
import { Flash, type FlashMessage } from "@gnoworld/ui";
import { lineKeeping } from "./LineKeeping.tsx";
import type { RoomKeeping } from "./RoomKeeping.ts";
import { LineActions } from "./LineActions.tsx";
import { useCopy, useRemoval } from "./lineFlash.ts";
import { useLineFocus } from "./lineFocus.ts";
import { LineView } from "./LineView.tsx";
import { mentionable } from "./names.ts";
import { chipsOf } from "./Reactions.tsx";
import { useListRead } from "./reading.ts";
import shared from "./lists.module.css";
import styles from "./RoomView.module.css";

const LINES = [shared["plain"], shared["scrolls"], styles["lines"]].join(" ");

export interface LinesProps {
  /** The room, whose lines have bars; none for a direct message's. */
  room: string | undefined;
  /** The partner of a direct message, whose lines have bars too (4d's DM bar), but no player and no link. */
  partner?: string | undefined;
  lines: readonly Line[];
  members: readonly string[];
  /** The reader's address, the lines that mention it marked; none for a guest. */
  me: string | undefined;
  /** The msgid of a line Ergo refused to delete, said until dismissed. */
  refused?: string | undefined;
  /** Whether the chat is connected: a delete that cannot go out says why (U8). */
  connected: boolean;
  /** Deletes a line, the reader's own; whether it went out. A room's view may leave out what a line's actions do:
   * nothing then, and a delete or a reaction never goes out. */
  onDelete?: ((id: string) => boolean) | undefined;
  /** The room's flash said Ergo's refusal of a delete. */
  onDismiss?: (() => void) | undefined;
  /** The room's reactions (4d), shown under their lines. */
  reactions?: readonly Reaction[] | undefined;
  /** Reacts to a line, or takes the reaction back, an account's; whether it went out. */
  onReact?: ((reaction: Reacting) => boolean) | undefined;
  /** Ergo refused a reaction the page sent here, said until dismissed (4d). */
  cannotReact?: true | undefined;
  /** Makes a line, by its msgid, the one the composer's next answers (4d). */
  onReply?: ((id: string) => void) | undefined;
  /** Opens the thread a line roots, by its msgid (4d's threads); none: no chip, no menu item. */
  onThread?: ((id: string) => void) | undefined;
  /** Puts a line's words in the composer to correct them, one of the reader's own (a direct message's). */
  onEdit?: ((id: string) => void) | undefined;
  /** The time of the last line the account read here, Ergo's (4f); none while unknown. */
  read?: string | undefined;
  /** The room's history page came: the New mark waits on it, as a live line may come before it (4f's G1). */
  paged?: boolean;
  /** The room read to its line `id`, the newest, while the reader is at the end and the page shows. */
  onRead?: ((id: string) => void) | undefined;
  /** The room's lines' verdicts, by msgid, from the server's stream (4g). */
  verdicts?: Readonly<Record<string, StreamEvent["state"]>> | undefined;
  /** Whether the reader saves data (ADR-0002 §8): then no player is offered (4g, F893). */
  saving?: boolean;
  /** What the reader keeps in this room and the room's pins (4d); none for a direct message's lines. */
  keeping?: RoomKeeping | undefined;
}

// What a line's actions do when a view gives none: nothing goes out.
const NO_DELETE = () => false;
const NO_DISMISS = () => undefined;
const NO_REACT = () => false;
const NO_REPLY = () => undefined;
const NO_REPLIES: ReadonlyMap<string, readonly Line[]> = new Map();

// What Ergo refused, said until the page dismisses it: a delete first, then a reaction; none, the page's own word.
const toldOf = (refused: string | undefined, cannotReact: true | undefined): FlashMessage | undefined => {
  if (refused !== undefined) return { title: "Could not delete the message.", line: "The chat refused it." };
  return cannotReact === undefined ? undefined : { title: "Could not react." };
};

// The flash: what Ergo refused, else the page's own word; closing it dismisses the refusal, or forgets the word.
interface ToldProps {
  refused: string | undefined;
  cannotReact: true | undefined;
  said: FlashMessage | null;
  setSaid: (said: FlashMessage | null) => void;
  onDismiss: () => void;
}

function Told({ refused, cannotReact, said, setSaid, onDismiss }: ToldProps) {
  const told = toldOf(refused, cannotReact);
  return (
    <Flash
      message={told ?? said}
      onClose={() => {
        if (told === undefined) setSaid(null);
        else onDismiss();
      }}
    />
  );
}

// What the list takes of the room: its lines as shown, what each shows of the reactions, and the line a msgid names.
type ListProps = Omit<LinesProps, "lines"> & {
  lines: readonly ShownLine[];
  shown: ReadonlyMap<string, readonly Shown[]>;
  lineOf: (id: string) => string;
  /** Who a mention may shorten. */
  known: ReadonlySet<string>;
  /** A reply's line by its msgid, this room's alone: a reply naming its own msgid or another room's answers none here. */
  byId: ReadonlyMap<string, Line>;
  /** Each line's reactions as chipsOf writes them, by msgid. */
  chips: ReadonlyMap<string, string>;
  /** Each root's replies, by msgid (4d's threads): a chip counts them. */
  repliesOf: ReadonlyMap<string, readonly Line[]>;
  /** The newest edit shown in each corrected line's place, by the line's msgid: the verdict a player waits on is its. */
  newest: ReadonlyMap<string, string>;
};

// What the reader keeps of a line, on this device (saved) and in its room (pinned) (4d).
const keptOf = (keeping: RoomKeeping | undefined, id: string) => ({
  saved: keeping?.saved.has(id) === true,
  pinned: keeping?.pinned.has(id) === true,
});

// The line a reply answers, when this room holds it: a reply naming its own msgid or another room's answers none here.
const answeredBy = (line: ShownLine, byId: ReadonlyMap<string, Line>, lineOf: (id: string) => string) =>
  line.reply === line.id ? undefined : byId.get(lineOf(line.reply ?? ""));

/** The room's flash, then its lines, oldest first, as a list a screen reader hears grow. */
export function Lines(props: LinesProps) {
  // The room's lines as shown: each corrected by its author's newest edit, the edits gone (4d, F664). Folded here, in a
  // component with no hook, as the compiler leaves a fold among hooks unmemoized: a pointer over a line folded the room
  // again (F1221).
  const { shown: lines, folded, newest } = foldEdits(props.lines);
  // What a plain client answers or reacts to by a folded edit's own msgid reaches the line it corrects (CR5).
  const lineOf = (id: string) => folded.get(id) ?? id;
  const shown = reactionsOn(props.reactions ?? [], props.me, lineOf);
  // The threads of the lines as shown: a reply that names a folded edit's msgid answers the line it corrects. A direct
  // message's lines root none.
  const threaded = props.room !== undefined;
  const repliesOf = threaded ? threadsOf(lines, lineOf).repliesOf : NO_REPLIES;
  const onThread = threaded ? props.onThread : undefined;
  const byId = new Map(lines.map((line) => [line.id, line]));
  // Each line's chips as a string a line compares by value (F1222).
  const chips = new Map([...shown].map(([id, each]) => [id, chipsOf(each)]));
  return (
    <List
      {...props}
      known={mentionable(props.members, lines)}
      byId={byId}
      chips={chips}
      onThread={onThread}
      lines={lines}
      shown={shown}
      lineOf={lineOf}
      newest={newest}
      repliesOf={repliesOf}
    />
  );
}

function List(props: ListProps) {
  const { room, partner, known, me, refused, connected, cannotReact, lines, shown, lineOf, newest } = props;
  const { onDelete = NO_DELETE, onDismiss = NO_DISMISS, onReact = NO_REACT, onReply = NO_REPLY } = props;
  const { verdicts, saving = false, keeping, byId, chips, repliesOf, onThread, onEdit } = props;
  const { fresh, listRef, onScroll } = useListRead(props);
  const { stop, mounted, on, leave } = useLineFocus(lines, listRef, fresh);
  const { said, setSaid, copy } = useCopy();
  const [deleting, remove] = useRemoval({ lines, refused, connected, onDelete, leave, setSaid, me, room });
  // A corrected line's player waits on its newest edit's verdict, the words it shows being the edit's (F1921).
  const verdictOf = (id: string) => verdicts?.[newest.get(id) ?? id];
  // A reaction that could not go out says so at once; one Ergo refuses, when it answers (cannotReact).
  const react = (reaction: Reacting) => {
    const went = onReact(reaction);
    if (!went) setSaid({ title: "Could not react." });
    return went;
  };
  const actionsOf = (line: Line) => (
    <LineActions
      line={line}
      room={room}
      dm={partner}
      me={me}
      deleting={line.id === deleting}
      onCopy={(what) => {
        onDismiss();
        copy(line, what, room ?? "");
      }}
      onDelete={remove}
      keeping={lineKeeping(keeping, me, setSaid)(line)}
      reactions={shown.get(line.id)}
      onReact={(emoji, on) => react({ to: line.id, emoji, on })}
      onReply={() => {
        onReply(line.id);
      }}
      onThread={onThread}
      onEdit={
        onEdit === undefined
          ? undefined
          : () => {
              onEdit(line.id);
            }
      }
    />
  );
  return (
    <>
      <Told refused={refused} cannotReact={cannotReact} said={said} setSaid={setSaid} onDismiss={onDismiss} />
      <ol
        ref={listRef}
        onScroll={onScroll}
        {...on}
        aria-label="Messages"
        // How the keyboard moves among the lines, which nothing else tells a screen reader (U14).
        aria-description="Up and down arrows move between messages; Tab reaches a message's actions."
        aria-live="polite"
        aria-relevant="additions"
        className={LINES}
      >
        {lines.map((line) => (
          <LineView
            key={line.id}
            line={line}
            me={me}
            members={known}
            stop={line.id === stop}
            actions={(room !== undefined || partner !== undefined) && mounted(line.id) ? actionsOf(line) : null}
            fresh={line.id === fresh}
            verdict={verdictOf(line.id)}
            players={room !== undefined && !saving}
            {...keptOf(keeping, line.id)}
            chips={chips.get(line.id)}
            react={me === undefined || !shown.has(line.id) ? undefined : react}
            answers={answeredBy(line, byId, lineOf)}
            replies={repliesOf.get(line.id)?.length}
            onThread={onThread}
          />
        ))}
      </ol>
    </>
  );
}

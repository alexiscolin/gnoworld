// A room's lines (slice 4's 4b, moved out of RoomView.tsx): the newest the store holds (the window), held at the
// newest while the reader is there; a line's text is Markdown (4c), built into elements from an allowlist
// (Message.tsx); one that mentions the reader says so (4d). The message menu (4c, docs/decisions.md 2026-10-26): the
// list is one tab stop, a line, the arrows moving among them; a line pointed at or focused shows its bar.
import { foldEdits, reactionsOn, threadsOf, type Line, type Reacting } from "@gnoworld/core";
import { useEntries } from "./chainEntries.ts";
import { useSaidAnswers, withJarvis } from "./jarvisEntries.tsx";
import { useJarvisItems } from "../../jarvisHere.ts";
import { lineKeeping } from "./LineKeeping.tsx";
import {
  answeredBy,
  keptOf,
  marksOf,
  NO_DELETE,
  NO_DISMISS,
  NO_REACT,
  NO_REPLIES,
  NO_REPLY,
  verdictIn,
  type LinesProps,
  type ListProps,
} from "./lineList.ts";
import { needing } from "./BarButtons.tsx";
import { LineActions } from "./LineActions.tsx";
import { forLine, useCopy, useRemoval } from "./lineFlash.ts";
import { useLineFocus } from "./lineFocus.ts";
import { Beside } from "./DayDivider.tsx";
import { LineView } from "./LineView.tsx";
import { Told } from "./Told.tsx";
import { TranslationHalt } from "./TranslationHalt.tsx";
import { mentionable } from "./names.ts";
import { chipsOn, firstWordsOf, groupedOf, votesOf, withDays } from "./lineMarks.ts";
import { useListRead } from "./reading.ts";
import { useNow } from "./useNow.ts";
import styles from "./RoomView.module.css";

export type { LinesProps } from "./lineList.ts";

const LINES = [styles["lines"], styles["fill"]].join(" ");

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
  const votes = votesOf({ lines, reactions: props.reactions ?? [], me: props.me, lineOf });
  const chips = chipsOn(shown, votes);
  // Here, not in the list a pointer redraws: the grouping is read once as the lines change.
  const now = useNow();
  const entries = withDays(
    withJarvis(useEntries(lines, props.room), useJarvisItems(props.room, props.me), useSaidAnswers(props.room)),
    new Date(now),
  );
  return (
    <>
      <TranslationHalt />
      <List
        entries={entries}
        grouped={groupedOf(entries)}
        votes={votes}
        firsts={firstWordsOf(lines, { room: props.room, paged: props.paged === true })}
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
    </>
  );
}

function List(props: ListProps) {
  const { room, partner, known, me, refused, connected, cannotReact, lines, shown, lineOf, newest } = props;
  const { onDelete = NO_DELETE, onDismiss = NO_DISMISS, onReact = NO_REACT, onReply = NO_REPLY } = props;
  const { verdicts, saving = false, keeping, byId, votes, repliesOf, onThread, onEdit } = props;
  const { fresh, listRef, onScroll } = useListRead(props);
  const { stop, mounted, on, leave, asked } = useLineFocus(lines, listRef, fresh);
  const { said, setSaid, copy } = useCopy();
  const [deleting, remove] = useRemoval({ lines, refused, connected, onDelete, leave, setSaid, me, room });
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
      onEdit={forLine(onEdit, line.id)}
      onNeed={needing(me, setSaid)}
      menuAt={asked?.id === line.id ? asked : undefined}
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
        {props.entries.map((entry) =>
          !("line" in entry) ? (
            <Beside key={entry.key} entry={entry} />
          ) : (
            <LineView
              key={entry.line.id}
              line={entry.line}
              me={me}
              members={known}
              stop={entry.line.id === stop}
              actions={
                (room !== undefined || partner !== undefined) && mounted(entry.line.id) ? actionsOf(entry.line) : null
              }
              fresh={entry.line.id === fresh}
              grouped={props.grouped.has(entry.line.id)}
              verdict={verdictIn(verdicts, newest, entry.line.id)}
              players={room !== undefined && !saving}
              {...keptOf(keeping, entry.line.id)}
              {...marksOf(props, entry.line.id)}
              react={me === undefined || (!shown.has(entry.line.id) && !votes.has(entry.line.id)) ? undefined : react}
              answers={answeredBy(entry.line, byId, lineOf)}
              replies={repliesOf.get(entry.line.id)?.length}
              onThread={onThread}
            />
          ),
        )}
      </ol>
    </>
  );
}

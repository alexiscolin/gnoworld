// A room's lines (slice 4's 4b, moved out of RoomView.tsx): the newest the store holds (the window), held at the
// newest while the reader is there; a line's text is Markdown (4c), built into elements from an allowlist
// (Message.tsx); one that mentions the reader says so (4d). The message menu (4c, docs/decisions.md 2026-10-26): the
// list is one tab stop, a line, the arrows moving among them; a line pointed at or focused shows its bar.
import { markdown, mentions, type Block, type Line } from "@gnoworld/core";
import { Flash } from "@gnoworld/ui";
import { useLayoutEffect, useRef, type ReactNode } from "react";
import { LineActions } from "./LineActions.tsx";
import { useCopy, useRemoval } from "./lineFlash.ts";
import { useLineFocus } from "./lineFocus.ts";
import { Markdown } from "./Message.tsx";
import { Person } from "./Person.tsx";
import { useNewMark, useReadAtEnd } from "./reading.ts";
import shared from "./lists.module.css";
import styles from "./RoomView.module.css";

// A line's look by its kind: a message plain, a notice and an /me apart.
const KINDS: Record<Line["kind"], string | undefined> = {
  message: undefined,
  notice: styles["notice"],
  action: styles["action"],
};
const LINES = [shared["plain"], shared["scrolls"], styles["lines"]].join(" ");
const CLOCK = new Intl.DateTimeFormat(undefined, { hour: "2-digit", minute: "2-digit", hourCycle: "h23" });

// A line's mentions, space-separated, read apart from its drawing so the compiler keeps the drawing's tree out of
// what a change of members recomputes.
const namesOf = (text: string): string => mentions(markdown(text)).join(" ");

// The addresses of `names` (a line's mentions, space-separated) that are members, as one string.
const knownOf = (names: string, members: ReadonlySet<string>): string =>
  names
    .split(" ")
    .filter((address) => members.has(address))
    .join(" ");

// A line's text drawn, its mentions of `known` (space-separated) shortened. A component of its own, with a string the
// compiler compares by value: the line keeps its drawing while others join and leave (F812's cost).
// Its links are Tab stops on the list's stop alone (U1).
interface LineTextProps {
  blocks: readonly Block[];
  me: string | undefined;
  known: string;
  stop: boolean;
}

function LineText({ blocks, me, known, stop }: LineTextProps) {
  return (
    <Markdown blocks={blocks} className={styles["text"]} me={me} members={new Set(known.split(" "))} tabbable={stop} />
  );
}

// A line, read once: drawn, and asked whether it mentions the reader, which a word says as well as its colour; a
// mention shortened for the reader and the room's members alone (F812). A change of members reads its mentions
// again, never its drawing.
interface LineViewProps {
  line: Line;
  me: string | undefined;
  members: ReadonlySet<string>;
  /** Whether it is the list's one tab stop. */
  stop: boolean;
  /** Its bar, while pointed at or focused. */
  actions: ReactNode;
  /** Whether it is the first line past the reading place as the room opened (4f). */
  fresh: boolean;
}

function LineView({ line, me, members, stop, actions, fresh }: LineViewProps) {
  const blocks = markdown(line.text);
  const names = namesOf(line.text);
  const mentioned = names.split(" ").some((address) => address === me);
  const known = knownOf(names, members);
  return (
    <li
      className={KINDS[line.kind]}
      data-about-me={mentioned ? "" : undefined}
      data-new={fresh ? "" : undefined}
      tabIndex={stop ? 0 : -1}
    >
      {fresh ? (
        <>
          {/* The prototype's divider: a row of its own, its word in the label style and a rule running on. */}
          <span className={styles["divider"]}>
            <span className="label">
              <span className={styles["fresh"]}>
                New<span className="visually-hidden"> from here</span>
              </span>
            </span>
          </span>{" "}
        </>
      ) : null}
      {/* The line's marks first, before the time: where no sender's words stand (F808). */}
      {mentioned ? <span className={styles["mentionsYou"]}>Mentions you </span> : null}
      {line.kind === "notice" ? <span className={styles["mark"]}>Notice </span> : null}
      <time dateTime={line.time} className={styles["time"]}>
        {CLOCK.format(new Date(line.time))}
      </time>{" "}
      {line.kind === "action" ? "* " : null}
      <Person name={line.account ?? line.from} guest={line.account === undefined} />{" "}
      <LineText blocks={blocks} me={me} known={known} stop={stop} />
      {actions}
    </li>
  );
}

// How near the end, in pixels, the reader still reads the newest line.
const AT_END = 32;

// Whether a list is scrolled to its end, or within AT_END of it.
const atEnd = (box: HTMLElement) => box.scrollHeight - box.scrollTop - box.clientHeight < AT_END;

// The lines held at their newest while the reader is there; once scrolled up, left where the reader is. A room with
// news opens on its New line, `fresh`, once (UX review's U1), and the reader is at the end only if that shows it.
function useNewestInView(lines: readonly Line[], fresh: string | undefined) {
  const listRef = useRef<HTMLOListElement>(null);
  const atEndRef = useRef(true);
  const placedRef = useRef(false);
  useLayoutEffect(() => {
    const box = listRef.current;
    if (box === null) return;
    const item = fresh === undefined || placedRef.current ? null : box.querySelector(":scope > li[data-new]");
    if (item !== null) {
      placedRef.current = true;
      box.scrollTop += item.getBoundingClientRect().top - box.getBoundingClientRect().top;
      atEndRef.current = atEnd(box);
    } else if (atEndRef.current) box.scrollTop = box.scrollHeight;
  }, [lines, fresh]);
  const onScroll = () => {
    if (listRef.current !== null) atEndRef.current = atEnd(listRef.current);
  };
  return { listRef, atEndRef, onScroll };
}

export interface LinesProps {
  room: string;
  lines: readonly Line[];
  members: readonly string[];
  /** The reader's address, the lines that mention it marked; none for a guest. */
  me: string | undefined;
  /** The msgid of a line Ergo refused to delete, said until dismissed. */
  refused?: string | undefined;
  /** Whether the chat is connected: a delete that cannot go out says why (U8). */
  connected: boolean;
  /** Deletes a line, the reader's own; whether it went out. */
  onDelete: (id: string) => boolean;
  /** The room's flash said Ergo's refusal of a delete. */
  onDismiss: () => void;
  /** The time of the last line the account read here, Ergo's (4f); none while unknown. */
  read?: string | undefined;
  /** The room's history page came: the New mark waits on it, as a live line may come before it (4f's G1). */
  paged?: boolean;
  /** The room read to its line `id`, the newest, while the reader is at the end and the page shows. */
  onRead?: ((id: string) => void) | undefined;
}

/** The room's flash, then its lines, oldest first, as a list a screen reader hears grow. */
export function Lines({
  room,
  lines,
  members,
  me,
  refused,
  connected,
  onDelete,
  onDismiss,
  read,
  paged = false,
  onRead,
}: LinesProps) {
  const fresh = useNewMark(lines, paged ? read : undefined, me);
  const { listRef, atEndRef, onScroll } = useNewestInView(lines, fresh);
  const look = useReadAtEnd(lines, atEndRef, paged ? onRead : undefined);
  const { stop, mounted, on, leave } = useLineFocus(lines, listRef, fresh);
  const { said, setSaid, copy } = useCopy(room);
  const [deleting, remove] = useRemoval({ lines, refused, connected, onDelete, leave, setSaid });
  // Who a mention may shorten (F812): the members, and the authors in view by their account tag, who proved their
  // key as a member did (F819).
  const known = new Set([...members, ...lines.flatMap(({ account }) => (account === undefined ? [] : [account]))]);
  const actionsOf = (line: Line) => (
    <LineActions
      line={line}
      room={room}
      me={me}
      deleting={line.id === deleting}
      onCopy={(what) => {
        onDismiss();
        copy(line, what);
      }}
      onDelete={remove}
    />
  );
  return (
    <>
      <Flash
        message={
          refused === undefined ? said : { title: "Could not delete the message.", line: "The chat refused it." }
        }
        onClose={() => {
          if (refused === undefined) setSaid(null);
          else onDismiss();
        }}
      />
      <ol
        ref={listRef}
        onScroll={() => {
          onScroll();
          look();
        }}
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
            actions={mounted(line.id) ? actionsOf(line) : null}
            fresh={line.id === fresh}
          />
        ))}
      </ol>
    </>
  );
}

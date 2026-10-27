// A room's lines (slice 4's 4b, moved out of RoomView.tsx): the newest the store holds (the window), held at the
// newest while the reader is there; a line's text is Markdown (4c), built into elements from an allowlist
// (Message.tsx); one that mentions the reader says so (4d). The message menu (4c, docs/decisions.md 2026-10-26): the
// list is one tab stop, a line, the arrows moving among them; a line pointed at or focused shows its bar.
import {
  type Block,
  type Line,
  markdown,
  mentions,
  type Reacting,
  type Reaction,
  reactionsOn,
  type Shown,
  type ShownLine,
  shownLines,
  editsFolded,
} from "@gnoworld/core";
import { Flash, type FlashMessage } from "@gnoworld/ui";
import { useLayoutEffect, useRef, useState, type ReactNode } from "react";
import { LineActions } from "./LineActions.tsx";
import { useLineFocus } from "./lineFocus.ts";
import { Markdown } from "./Message.tsx";
import { roomHref } from "./names.ts";
import { Person } from "./Person.tsx";
import { Reactions } from "./Reactions.tsx";
import { Quote } from "./Replying.tsx";
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
function LineText({ blocks, me, known }: { blocks: readonly Block[]; me: string | undefined; known: string }) {
  return <Markdown blocks={blocks} className={styles["text"]} me={me} members={new Set(known.split(" "))} />;
}

// A line, read once: drawn, and asked whether it mentions the reader, which a word says as well as its colour; a
// mention shortened for the reader and the room's members alone (F812). A change of members reads its mentions
// again, never its drawing.
interface LineViewProps {
  line: ShownLine;
  me: string | undefined;
  members: ReadonlySet<string>;
  /** Whether it is the list's one tab stop. */
  stop: boolean;
  /** Its bar, while pointed at or focused. */
  actions: ReactNode;
  /** Its reactions as shown (4d), and how an account reacts; none for a guest. */
  reactions: readonly Shown[] | undefined;
  react: ((reaction: Reacting) => boolean) | undefined;
  /** The line it answers, when the room holds it (4d's replies). */
  answers: Line | undefined;
}

function LineView({ line, me, members, stop, actions, reactions, react, answers }: LineViewProps) {
  const blocks = markdown(line.text);
  const names = namesOf(line.text);
  const mentioned = names.split(" ").some((address) => address === me);
  const known = knownOf(names, members);
  return (
    <li className={KINDS[line.kind]} data-about-me={mentioned ? "" : undefined} tabIndex={stop ? 0 : -1}>
      {/* The line's marks first, at its start, before a reply's quote and the time: where no sender's words stand
          (F808, the security review's S2). */}
      {mentioned ? <span className={styles["mentionsYou"]}>Mentions you </span> : null}
      {line.kind === "notice" ? <span className={styles["mark"]}>Notice </span> : null}
      {line.edited === true ? <span className={styles["mark"]}>Edited </span> : null}
      <Quote line={line} answers={answers} known={(address) => address === me || members.has(address)} />
      <time dateTime={line.time} className={styles["time"]}>
        {CLOCK.format(new Date(line.time))}
      </time>{" "}
      {line.kind === "action" ? "* " : null}
      <Person name={line.account ?? line.from} guest={line.account === undefined} />{" "}
      <LineText blocks={blocks} me={me} known={known} />
      {reactions === undefined ? null : <Reactions to={line.id} shown={reactions} react={react} />}
      {actions}
    </li>
  );
}

// How near the end, in pixels, the reader still reads the newest line.
const AT_END = 32;

// The lines held at their newest while the reader is there, as a line comes or a reaction grows one (the code
// review's CR3); once scrolled up, left where the reader is.
function useNewestInView(lines: readonly Line[], reactions: readonly Reaction[] | undefined) {
  const listRef = useRef<HTMLOListElement>(null);
  const atEndRef = useRef(true);
  useLayoutEffect(() => {
    if (listRef.current !== null && atEndRef.current) listRef.current.scrollTop = listRef.current.scrollHeight;
  }, [lines, reactions]);
  const onScroll = () => {
    const box = listRef.current;
    if (box !== null) atEndRef.current = box.scrollHeight - box.scrollTop - box.clientHeight < AT_END;
  };
  return { listRef, onScroll };
}

// What a copy says, in the room's flash: done, or not, a page with no clipboard (a plain http origin) included.
function useCopy(room: string) {
  const [said, setSaid] = useState<FlashMessage | null>(null);
  const copy = (line: Line, what: "text" | "link") => {
    setSaid(null);
    const text = what === "text" ? line.text : new URL(roomHref(room), location.href).href;
    // A page with no clipboard throws at once: inside a then, it fails as a refusal does.
    Promise.resolve()
      .then(() => navigator.clipboard.writeText(text))
      .then(
        () => {
          setSaid({ title: what === "text" ? "Text copied." : "Link copied." });
        },
        () => {
          setSaid({ title: "Could not copy." });
        },
      );
  };
  return { said, setSaid, copy };
}

export interface LinesProps {
  room: string;
  lines: readonly Line[];
  members: readonly string[];
  /** The reader's address, the lines that mention it marked; none for a guest. */
  me: string | undefined;
  /** The msgid of a line Ergo refused to delete, said until dismissed. */
  refused?: string | undefined;
  /** Deletes a line, the reader's own; whether it went out. */
  onDelete: (id: string) => boolean;
  /** The room's flash said Ergo's refusal of a delete. */
  onDismiss: () => void;
  /** The room's reactions (4d), shown under their lines. */
  reactions?: readonly Reaction[] | undefined;
  /** Reacts to a line, or takes the reaction back, an account's; whether it went out. */
  onReact: (reaction: Reacting) => boolean;
  /** Ergo refused a reaction the page sent here, said until dismissed (4d). */
  cannotReact?: true | undefined;
  /** Makes a line, by its msgid, the one the composer's next answers (4d). */
  onReply: (id: string) => void;
}

// What Ergo refused, said until the page dismisses it: a delete first, then a reaction; none, the page's own word.
const toldOf = (refused: string | undefined, cannotReact: true | undefined): FlashMessage | undefined => {
  if (refused !== undefined) return { title: "Could not delete the message." };
  return cannotReact === undefined ? undefined : { title: "Could not react." };
};

/** The room's flash, then its lines, oldest first, as a list a screen reader hears grow. */
export function Lines(props: LinesProps) {
  const { room, members, me, refused, onDelete, onDismiss, reactions, onReact, cannotReact, onReply } = props;
  // The room's lines as shown: each corrected by its author's newest edit, the edits gone (4d, F664).
  const lines = shownLines(props.lines);
  const { listRef, onScroll } = useNewestInView(lines, reactions);
  const { stop, mounted, on, leave } = useLineFocus(lines, listRef);
  const { said, setSaid, copy } = useCopy(room);
  // What a plain client answers or reacts to by a folded edit's own msgid reaches the line it corrects (CR5).
  const folded = editsFolded(props.lines);
  const lineOf = (id: string) => folded.get(id) ?? id;
  const shown = reactionsOn(
    (reactions ?? []).map((reaction) => ({ ...reaction, to: lineOf(reaction.to) })),
    me,
  );
  // A reply's line by its msgid, this room's alone: a reply naming its own msgid or another room's answers none here.
  const byId = new Map(lines.map((line) => [line.id, line]));
  // Who a mention may shorten (F812): the members, and the authors in view by their account tag, who proved their
  // key as a member did (F819).
  const known = new Set([...members, ...lines.flatMap(({ account }) => (account === undefined ? [] : [account]))]);
  // A delete that went out hands the focus to a neighbour; one that could not (the link down, a msgid no command
  // carries) says so, the line kept (/code-review).
  const remove = (id: string) => {
    const went = onDelete(id);
    if (went) leave(id);
    else setSaid({ title: "Could not delete the message." });
    return went;
  };
  // A reaction that could not go out says so at once; one Ergo refuses, when it answers (cannotReact).
  const react = (reaction: Reacting) => {
    const went = onReact(reaction);
    if (!went) setSaid({ title: "Could not react." });
    return went;
  };
  const told = toldOf(refused, cannotReact);
  const actionsOf = (line: Line) => (
    <LineActions
      line={line}
      room={room}
      me={me}
      onCopy={(what) => {
        onDismiss();
        copy(line, what);
      }}
      onDelete={remove}
      reactions={shown.get(line.id)}
      onReact={(emoji, on) => react({ to: line.id, emoji, on })}
      onReply={() => {
        onReply(line.id);
      }}
    />
  );
  return (
    <>
      <Flash
        message={told ?? said}
        onClose={() => {
          if (told === undefined) setSaid(null);
          else onDismiss();
        }}
      />
      <ol
        ref={listRef}
        onScroll={onScroll}
        {...on}
        aria-label="Messages"
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
            reactions={shown.get(line.id)}
            react={me === undefined ? undefined : react}
            answers={line.reply === line.id ? undefined : byId.get(lineOf(line.reply ?? ""))}
          />
        ))}
      </ol>
    </>
  );
}

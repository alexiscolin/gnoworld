// A room's lines (slice 4's 4b, moved out of RoomView.tsx): the newest the store holds (the window), held at the
// newest while the reader is there; a line's text is Markdown (4c), built into elements from an allowlist
// (Message.tsx); one that mentions the reader says so (4d).
import { markdown, mentions, type Block, type Line } from "@gnoworld/core";
import { useLayoutEffect, useRef } from "react";
import { Markdown } from "./Message.tsx";
import { Person } from "./Person.tsx";
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
function LineView({ line, me, members }: { line: Line; me: string | undefined; members: ReadonlySet<string> }) {
  const blocks = markdown(line.text);
  const names = namesOf(line.text);
  const mentioned = names.split(" ").some((address) => address === me);
  const known = knownOf(names, members);
  return (
    <li className={KINDS[line.kind]} data-about-me={mentioned ? "" : undefined}>
      {/* The line's marks first, before the time: where no sender's words stand (F808). */}
      {mentioned ? <span className={styles["mentionsYou"]}>Mentions you </span> : null}
      {line.kind === "notice" ? <span className={styles["mark"]}>Notice </span> : null}
      <time dateTime={line.time} className={styles["time"]}>
        {CLOCK.format(new Date(line.time))}
      </time>{" "}
      {line.kind === "action" ? "* " : null}
      <Person name={line.account ?? line.from} guest={line.account === undefined} />{" "}
      <LineText blocks={blocks} me={me} known={known} />
    </li>
  );
}

// How near the end, in pixels, the reader still reads the newest line.
const AT_END = 32;

// The lines held at their newest while the reader is there; once scrolled up, left where the reader is.
function useNewestInView(lines: readonly Line[]) {
  const listRef = useRef<HTMLOListElement>(null);
  const atEndRef = useRef(true);
  useLayoutEffect(() => {
    if (listRef.current !== null && atEndRef.current) listRef.current.scrollTop = listRef.current.scrollHeight;
  }, [lines]);
  const onScroll = () => {
    const box = listRef.current;
    if (box !== null) atEndRef.current = box.scrollHeight - box.scrollTop - box.clientHeight < AT_END;
  };
  return { listRef, onScroll };
}

export interface LinesProps {
  lines: readonly Line[];
  members: readonly string[];
  /** The reader's address, the lines that mention it marked; none for a guest. */
  me: string | undefined;
}

/** The room's lines, oldest first, as a list a screen reader hears grow. */
export function Lines({ lines, members, me }: LinesProps) {
  const { listRef, onScroll } = useNewestInView(lines);
  // Who a mention may shorten (F812): the members, and the authors in view by their account tag, who proved their
  // key as a member did (F819).
  const known = new Set([...members, ...lines.flatMap(({ account }) => (account === undefined ? [] : [account]))]);
  return (
    <ol
      ref={listRef}
      onScroll={onScroll}
      aria-label="Messages"
      aria-live="polite"
      aria-relevant="additions"
      className={LINES}
      tabIndex={0}
    >
      {lines.map((line) => (
        <LineView key={line.id} line={line} me={me} members={known} />
      ))}
    </ol>
  );
}

// A room's line (slice 4's 4b, moved out of Lines.tsx): its marks, its time, its author, its text drawn from Markdown
// (4c), its link's player (4g) and its bar. One that mentions the reader says so (4d), one of the reader's own says
// "you" (4e).
import { markdown, mentions, type Block, type Line, type Reacting, type ShownLine } from "@gnoworld/core";
import type { StreamEvent } from "@gnoworld/schemas";
import type { ReactNode } from "react";
import { Embed } from "./Embed.tsx";
import { embedIn } from "./embeds.ts";
import { Markdown } from "./Message.tsx";
import { Person } from "./Person.tsx";
import { Reactions } from "./Reactions.tsx";
import { Quote } from "./Replying.tsx";
import { ThreadChip } from "./ThreadChip.tsx";
import styles from "./RoomView.module.css";

// A line's look by its kind: a message plain, a notice and an /me apart.
const KINDS: Record<Line["kind"], string | undefined> = {
  message: undefined,
  notice: styles["notice"],
  action: styles["action"],
};
const CLOCK = new Intl.DateTimeFormat(undefined, { hour: "2-digit", minute: "2-digit", hourCycle: "h23" });

// A line's mentions, space-separated, read apart from its drawing so the compiler keeps the drawing's tree out of
// what a change of members recomputes.
const namesOf = (text: string): string => mentions(markdown(text)).join(" ");

// The addresses of `names` (a line's mentions, space-separated) that are members, or `me`, as one string.
const knownOf = (names: string, members: ReadonlySet<string>, me?: string): string =>
  names
    .split(" ")
    .filter((address) => address === me || members.has(address))
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

// The prototype's divider: a row of its own, its word in the label style and a rule running on.
function NewDivider() {
  return (
    <>
      <span className={styles["divider"]}>
        <span className="label">
          <span className={styles["fresh"]}>
            New<span className="visually-hidden"> from here</span>
          </span>
        </span>
      </span>{" "}
    </>
  );
}

// A line's author: its account's address shortened or its guest's nick, then "you" if it is mine.
function Author({ line, mine }: { line: Line; mine: boolean }) {
  return (
    <span className={styles["author"]}>
      <Person name={line.account ?? line.from} guest={line.account === undefined} />
      {mine ? " you" : null}
    </span>
  );
}

// "Edited" on the time's row, before the sender, when the author's later edit is what the line shows (4d, U5).
function Edited({ edited }: { edited: boolean | undefined }) {
  return edited === true ? <span className={styles["mark"]}>Edited </span> : null;
}

// A line's reactions under it, when it has any (4d).
function Chips({ to, chips, react }: { to: string; chips: string | undefined; react: LineViewProps["react"] }) {
  return chips === undefined ? null : <Reactions to={to} chips={chips} react={react} />;
}

// The line's marks first, before the time: where no sender's words stand (F808).
function Marks({ mentioned, notice }: { mentioned: boolean; notice: boolean }) {
  return (
    <>
      {mentioned ? <span className={styles["mentionsYou"]}>Mentions you </span> : null}
      {notice ? <span className={styles["mark"]}>Notice </span> : null}
    </>
  );
}

// What the quote of a reply shortens: the mentions of the line answered, as the line shortens its own.
const quoteKnown = (answers: Line | undefined, members: ReadonlySet<string>, me: string | undefined): string =>
  answers === undefined ? "" : knownOf(namesOf(answers.text), members, me);

// How a row stands in its list: the list's tab stop or not, its links Tab stops, and its msgid on a line that opens a
// thread (the focus comes back to it). A thread's own row is none of the list's: no stop, its links Tab stops.
function rowOf({
  id,
  stop,
  inThread,
  threads,
}: {
  id: string;
  stop: boolean;
  inThread: true | undefined;
  threads: boolean;
}) {
  const attrs = { ...(threads ? { "data-line": id } : {}), tabIndex: inThread === true ? undefined : stop ? 0 : -1 };
  return { attrs, links: stop || inThread === true };
}

interface ChipOf {
  id: string;
  replies: number | undefined;
  stop: boolean;
  onThread: ((id: string) => void) | undefined;
}

// The chip of the thread a line roots, when the page opens threads and the line has replies; none for a line without.
function chipOf({ id, replies, stop, onThread }: ChipOf) {
  return replies === undefined || onThread === undefined ? null : (
    <>
      {" "}
      <ThreadChip id={id} count={replies} stop={stop} onThread={onThread} />
    </>
  );
}

// A line, read once: drawn, and asked whether it mentions the reader, which a word says as well as its colour; a
// mention shortened for the reader and the room's members alone (F812). A change of members reads its mentions
// again, never its drawing.
export interface LineViewProps {
  line: ShownLine;
  me: string | undefined;
  members: ReadonlySet<string>;
  /** Whether it is the list's one tab stop. */
  stop: boolean;
  /** Its bar, while pointed at or focused. */
  actions: ReactNode;
  /** Whether it is the first line past the reading place as the room opened (4f). */
  fresh: boolean;
  /** Its verdict from the server's stream, which a link's player waits on (4g). */
  verdict: StreamEvent["state"] | undefined;
  /** Whether a link's player is offered: not to a reader who saves data, nor in a direct message. */
  players: boolean;
  /** Its reactions as shown (4d), as chipsOf writes them, and how an account reacts; none for a guest. */
  chips: string | undefined;
  react: ((reaction: Reacting) => boolean) | undefined;
  /** The line it answers, when the room holds it (4d's replies). */
  answers: Line | undefined;
  /** The replies of the thread it roots, and how a chip opens it (4d's threads); none draws no chip. */
  replies?: number | undefined;
  onThread?: ((id: string) => void) | undefined;
  /** A row of a thread's own list: no quote, no tab stop of the list's, its links Tab stops. */
  inThread?: true | undefined;
}

export function LineView(props: LineViewProps) {
  const { line, me, members, stop, actions, fresh, verdict, players, chips, react, answers } = props;
  const { replies, onThread, inThread } = props;
  const row = rowOf({ id: line.id, stop, inThread, threads: onThread !== undefined });
  const blocks = markdown(line.text);
  // Its first link to an accepted service gets a player, but for a reader who saves data (4g).
  const embed = players ? embedIn(blocks) : undefined;
  const names = namesOf(line.text);
  const mentioned = names.split(" ").some((address) => address === me);
  const known = knownOf(names, members);
  // What the quote shortens, a string the compiler compares by value: the quote is cut again only when its own words or
  // the people they mention change, never as other lines come (F1220).
  const quoted = quoteKnown(answers, members, me);
  // Mine: my name in mint and the word "you" (DESIGN-SYSTEM.md, Avatar; U5).
  const mine = me !== undefined && line.account === me;
  return (
    <li
      className={KINDS[line.kind]}
      data-about-me={mentioned ? "" : undefined}
      data-new={fresh ? "" : undefined}
      data-mine={mine ? "" : undefined}
      {...row.attrs}
    >
      {fresh ? <NewDivider /> : null}
      <Marks mentioned={mentioned} notice={line.kind === "notice"} />
      {inThread === true ? null : <Quote line={line} answers={answers} known={quoted} />}
      <time dateTime={line.time} className={styles["time"]}>
        {CLOCK.format(new Date(line.time))}
      </time>{" "}
      <Edited edited={line.edited} />
      {line.kind === "action" ? "* " : null}
      <Author line={line} mine={mine} /> <LineText blocks={blocks} me={me} known={known} stop={row.links} />
      {embed === undefined ? null : <Embed embed={embed} verdict={verdict} />}
      {/* Before the chips in the Tab order, so Reply is a few presses away; it floats, so its place shows nowhere (U2). */}
      {actions}
      <Chips to={line.id} chips={chips} react={react} />
      {chipOf({ id: line.id, replies, stop, onThread })}
    </li>
  );
}

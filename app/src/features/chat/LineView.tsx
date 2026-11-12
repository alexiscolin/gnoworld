// A room's line (slice 4's 4b, moved out of Lines.tsx): its marks, its time, its author, its text drawn from Markdown
// (4c), its link's player (4g), its link's page preview (8f), its link's card (L4) and its bar. One that mentions the reader says so (4d), one of the reader's own says
// "you" (4e).
import { cardOf, markdown, mentions, pollOf, type Line, type Reacting, type ShownLine } from "@gnoworld/core";
import type { StreamEvent } from "@gnoworld/schemas";
import type { ReactNode } from "react";
import { Embed } from "./Embed.tsx";
import { embedIn } from "./embeds.ts";
import { Head } from "./LineHead.tsx";
import { LineText } from "./LineText.tsx";
import { LineTranslation } from "./LineTranslation.tsx";
import { LineCard, type LineCardProps } from "./LineCard.tsx";
import { LinePreview } from "./LinePreview.tsx";
import { Reactions } from "./Reactions.tsx";
import { PollView } from "./PollView.tsx";
import { SharedCard } from "./SharedCard.tsx";
import { Quote } from "./Replying.tsx";
import { ThreadChip } from "./ThreadChip.tsx";
import styles from "./RoomView.module.css";

// A line's look by its kind: a message plain, a notice and an /me apart.
const KINDS: Record<Line["kind"], string | undefined> = {
  message: undefined,
  notice: styles["notice"],
  action: styles["action"],
};

// A line's mentions, space-separated, read apart from its drawing so the compiler keeps the drawing's tree out of
// what a change of members recomputes.
const namesOf = (text: string): string => mentions(markdown(text)).join(" ");

// The addresses of `names` (a line's mentions, space-separated) that are members, or `me`, as one string.
const knownOf = (names: string, members: ReadonlySet<string>, me?: string): string =>
  names
    .split(" ")
    .filter((address) => address === me || members.has(address))
    .join(" ");

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

// The card a message's words are (core's cardLine.ts): where a player is offered alone, which a direct message and a reader who saves data are
// not given, the card fetching its own data.
const cardIn = ({ kind, text }: Line, players: boolean): ReturnType<typeof cardOf> =>
  kind === "message" && players ? cardOf(text) : undefined;

// A line's words, or a poll's bars or a card in their place (core's poll.ts, cardLine.ts), over the room kept for its bar.
function Body({
  line,
  votes,
  react,
  players,
  children,
}: Pick<LineViewProps, "line" | "votes" | "react" | "players"> & { children: ReactNode }) {
  const poll = votes === undefined ? undefined : pollOf(line.text);
  const card = cardIn(line, players);
  let drawn = children;
  if (card !== undefined) drawn = <SharedCard card={card} />;
  else if (poll !== undefined) drawn = <PollView to={line.id} poll={poll} votes={votes ?? ""} react={react} />;
  return (
    <div data-line-text="" className={votes === undefined && card === undefined ? undefined : styles["wide"]}>
      {drawn}
    </div>
  );
}

// A line's reactions under it, when it has any (4d).
function Chips({ to, chips, react }: { to: string; chips: string | undefined; react: LineViewProps["react"] }) {
  return chips === undefined || chips === "" ? null : <Reactions to={to} chips={chips} react={react} />;
}

// What the quote of a reply shortens: the mentions of the line answered, as the line shortens its own.
const quoteKnown = (answers: Line | undefined, members: ReadonlySet<string>, me: string | undefined): string =>
  answers === undefined ? "" : knownOf(namesOf(answers.text), members, me);

// How a row stands in its list: the list's tab stop or not, its links Tab stops, and its msgid on a line that opens a
// thread (the focus comes back to it). A thread's own row is none of the list's: no stop, its links Tab stops.
// A line that goes on its author's group draws no face and name, but for the one that opens the New divider.
function rowOf({
  id,
  stop,
  inThread,
  threads,
  grouped,
  fresh,
}: {
  id: string;
  stop: boolean;
  inThread: true | undefined;
  threads: boolean;
  grouped: boolean | undefined;
  fresh: boolean;
}) {
  const show = grouped === true && !fresh;
  const attrs = {
    ...(threads ? { "data-line": id } : {}),
    ...(show ? { "data-grouped": "" } : {}),
    tabIndex: inThread === true ? undefined : stop ? 0 : -1,
  };
  return { attrs, links: stop || inThread === true, grouped: show };
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
    <span className={styles["thread"]}>
      <ThreadChip id={id} count={replies} stop={stop} onThread={onThread} />
    </span>
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
  /** Whether it goes on its author's group: no face and name, its time in the gutter on hover. */
  grouped?: boolean;
  /** Whether it is the first line past the reading place as the room opened (4f). */
  fresh: boolean;
  /** Its verdict from the server's stream, which a link's player waits on (4g). */
  verdict: StreamEvent["state"] | undefined;
  /** Whether a link's player is offered: not to a reader who saves data, nor in a direct message. */
  players: boolean;
  /** What its card needs (link-previews L4, lineCard.ts's cardOf); none for a direct message's line, which has no card. */
  card?: LineCardProps["card"];
  /** Whether it is saved on this device, and whether it is pinned in its room (4d). */
  saved: boolean;
  pinned: boolean;
  /** Its reactions as shown (4d), as chipsOf writes them, and how an account reacts; none for a guest. */
  chips: string | undefined;
  /** Whether it is its author's first words in the room: the video's "new here". */
  newHere?: boolean | undefined;
  /** A poll line's votes, as votesString writes them; none for a line that is no poll. */
  votes?: string | undefined;
  react: ((reaction: Reacting) => boolean) | undefined;
  /** The line it answers, when the room holds it (4d's replies). */
  answers: Line | undefined;
  /** The replies of the thread it roots, and how a chip opens it (4d's threads); none draws no chip. */
  replies?: number | undefined;
  onThread?: ((id: string) => void) | undefined;
  /** A row of a thread's own list: no quote, no tab stop of the list's, its links Tab stops. */
  inThread?: true | undefined;
  /** The room it is in, where its translation is asked and drawn; none for a thread's own row. */
  room?: string | undefined;
}

/** The props of a row with no bar, chip, mark, player or quote: what a thread's row and a plain row take beside its line, reader and members. */
export const BARE_ROW = {
  stop: false,
  actions: null,
  fresh: false,
  verdict: undefined,
  players: false,
  saved: false,
  pinned: false,
  chips: undefined,
  react: undefined,
  answers: undefined,
} satisfies Pick<
  LineViewProps,
  "stop" | "actions" | "fresh" | "verdict" | "players" | "saved" | "pinned" | "chips" | "react" | "answers"
>;

export function LineView(props: LineViewProps) {
  const { line, me, members, stop, actions, fresh, verdict, players, saved, pinned, chips, react, answers } = props;
  const { replies, onThread, inThread, votes, newHere, card, room } = props;
  const row = rowOf({
    id: line.id,
    stop,
    inThread,
    threads: onThread !== undefined,
    grouped: props.grouped,
    fresh,
  });
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
      <Head {...{ line, mine, me, mentioned, saved, pinned, newHere, grouped: row.grouped }} />
      {inThread === true ? null : <Quote line={line} answers={answers} known={quoted} />}
      <Body line={line} votes={votes} react={react} players={players}>
        <LineText blocks={blocks} me={me} known={known} stop={row.links} />
      </Body>
      <LineTranslation line={line} room={room} mine={mine} me={me} known={known} stop={row.links} />
      {embed === undefined ? null : <Embed key={embed.src} embed={embed} verdict={verdict} />}
      <LinePreview blocks={blocks} verdict={verdict} tabbable={row.links} />
      <LineCard
        card={card}
        text={line.text}
        blocks={blocks}
        player={embed !== undefined}
        verdict={verdict}
        mine={mine}
        tabbable={row.links}
      />
      {/* Before the chips in the Tab order, so Reply is a few presses away; it floats, so its place shows nowhere (U2). */}
      {actions}
      {/* The reactions at the line's start, the thread's chip at its end, on one row; none drawn, no row. */}
      <div className={styles["foot"]}>
        <Chips to={line.id} chips={chips} react={react} />
        {chipOf({ id: line.id, replies, stop, onThread })}
      </div>
    </li>
  );
}

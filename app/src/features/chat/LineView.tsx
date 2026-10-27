// A room's line (slice 4's 4b, moved out of Lines.tsx): its marks, its time, its author, its text drawn from Markdown
// (4c), its link's player (4g) and its bar. One that mentions the reader says so (4d), one of the reader's own says
// "you" (4e).
import { markdown, mentions, type Block, type Line } from "@gnoworld/core";
import type { StreamEvent } from "@gnoworld/schemas";
import { Icon } from "@gnoworld/ui";
import type { ReactNode } from "react";
import { Embed } from "./Embed.tsx";
import { embedIn } from "./embeds.ts";
import { Markdown } from "./Message.tsx";
import { Person } from "./Person.tsx";
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

// The line's marks first, before the time: where no sender's words stand (F808). Pinned and Saved are a word and an
// icon (4d): one reads the room's pins, the other what this device kept.
function Marks({
  mentioned,
  notice,
  saved,
  pinned,
}: { mentioned: boolean; notice: boolean } & Pick<LineViewProps, "saved" | "pinned">) {
  return (
    <>
      {mentioned ? <span className={styles["mentionsYou"]}>Mentions you </span> : null}
      {notice ? <span className={styles["mark"]}>Notice </span> : null}
      {pinned ? (
        <span className={styles["mark"]}>
          <Icon name="pin" />
          Pinned{" "}
        </span>
      ) : null}
      {saved ? (
        <span className={styles["mark"]}>
          <Icon name="bookmark" />
          Saved{" "}
        </span>
      ) : null}
    </>
  );
}

// A line, read once: drawn, and asked whether it mentions the reader, which a word says as well as its colour; a
// mention shortened for the reader and the room's members alone (F812). A change of members reads its mentions
// again, never its drawing.
export interface LineViewProps {
  line: Line;
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
  /** Whether it is saved on this device, and whether it is pinned in its room (4d). */
  saved: boolean;
  pinned: boolean;
}

export function LineView({ line, me, members, stop, actions, fresh, verdict, players, saved, pinned }: LineViewProps) {
  const blocks = markdown(line.text);
  // Its first link to an accepted service gets a player, but for a reader who saves data (4g).
  const embed = players ? embedIn(blocks) : undefined;
  const names = namesOf(line.text);
  const mentioned = names.split(" ").some((address) => address === me);
  const known = knownOf(names, members);
  // Mine: my name in mint and the word "you" (DESIGN-SYSTEM.md, Avatar; U5).
  const mine = me !== undefined && line.account === me;
  return (
    <li
      className={KINDS[line.kind]}
      data-about-me={mentioned ? "" : undefined}
      data-new={fresh ? "" : undefined}
      data-mine={mine ? "" : undefined}
      tabIndex={stop ? 0 : -1}
    >
      {fresh ? <NewDivider /> : null}
      <Marks mentioned={mentioned} notice={line.kind === "notice"} saved={saved} pinned={pinned} />
      <time dateTime={line.time} className={styles["time"]}>
        {CLOCK.format(new Date(line.time))}
      </time>{" "}
      {line.kind === "action" ? "* " : null}
      <Author line={line} mine={mine} /> <LineText blocks={blocks} me={me} known={known} stop={stop} />
      {embed === undefined ? null : <Embed embed={embed} verdict={verdict} />}
      {actions}
    </li>
  );
}

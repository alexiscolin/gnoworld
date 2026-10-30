// A line's head (slice 4's 4b, moved out of LineView.tsx): the face, where its author comes from, the name, the marks and
// the time.
import type { Line, ShownLine } from "@gnoworld/core";
import { Avatar, Cluster, Icon } from "@gnoworld/ui";
import { Person } from "./Person.tsx";
import styles from "./RoomView.module.css";

const CLOCK = new Intl.DateTimeFormat(undefined, { hour: "2-digit", minute: "2-digit", hourCycle: "h23" });

// A line's author: its account's address shortened or its guest's nick, then "you" if it is mine.
function Author({ line, mine }: { line: Line; mine: boolean }) {
  return (
    <span className={styles["author"]}>
      <Person name={line.account ?? line.from} guest={line.account === undefined} />
      {mine ? " you" : null}
    </span>
  );
}

/** Where a person comes from, when they chose to say so: the two letters the video draws, the country in words for a
 * screen reader and a pointer. */
export interface Country {
  code: string;
  name: string;
}

/** The country's tag, drawn before a name, whose words say the country: none for a person who did not opt in. */
export function CountryTag({ country }: { country: Country | undefined }) {
  return country === undefined ? null : (
    <>
      <span
        role="img"
        className={styles["country"]}
        data-country={country.code}
        title={country.name}
        aria-label={country.name}
      >
        {country.code}
      </span>{" "}
    </>
  );
}

// "Edited" in the head, before the time, when the author's later edit is what the line shows (4d, U5).
function Edited({ edited }: { edited: boolean | undefined }) {
  return edited === true ? <span className={styles["mark"]}>Edited </span> : null;
}

// The line's marks in its head, before the time: where no sender's words stand (F808). Pinned and Saved are a word and an
// icon (4d): one reads the room's pins, the other what this device kept.
function Marks({
  mentioned,
  notice,
  saved,
  pinned,
}: {
  mentioned: boolean;
  notice: boolean;
  saved: boolean;
  pinned: boolean;
}) {
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

interface HeadProps {
  line: ShownLine;
  mine: boolean;
  mentioned: boolean;
  saved: boolean;
  pinned: boolean;
  country?: Country | undefined;
}

// The head: the face, where they come from, the name, what the line is marked, and the time at the far end.
export function Head({ line, mine, mentioned, saved, pinned, country }: HeadProps) {
  return (
    <div className={styles["head"]} data-line-head="">
      <Cluster space="2xs">
        <Avatar address={line.account ?? line.from} name={line.from} size="s" decorative />
        <CountryTag country={country} />
        {line.kind === "action" ? "* " : null}
        <Author line={line} mine={mine} />{" "}
        <Marks mentioned={mentioned} notice={line.kind === "notice"} saved={saved} pinned={pinned} />
        <Edited edited={line.edited} />
        <time dateTime={line.time} className={styles["time"]}>
          {CLOCK.format(new Date(line.time))}
        </time>
      </Cluster>
    </div>
  );
}

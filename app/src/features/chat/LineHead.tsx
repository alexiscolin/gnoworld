// A line's head (slice 4's 4b, moved out of LineView.tsx): the face, the name, the marks and the time.
import type { Line, ShownLine } from "@gnoworld/core";
import { Avatar, Cluster, Icon } from "@gnoworld/ui";
import { Person } from "./Person.tsx";
import styles from "./RoomView.module.css";

const CLOCK = new Intl.DateTimeFormat(undefined, { hour: "2-digit", minute: "2-digit", hourCycle: "h23" });
const REGIONS = new Intl.DisplayNames("en", { type: "region", fallback: "none" });
// What the browser names and the table of countries does not: old codes, unions, test regions. The table stays out of these lines' chunk, every
// reader's, 3.8 KB for a title; LineView.test.tsx holds the two together, code by code.
const NOT_COUNTRIES = "AC AN BU CP CQ CS DD DG DY EA EU EZ FX HV IC NH QO RH SU TA TP UK UN VD XA XB YD YU ZR ZZ";

// A line's author: its account's address shortened or its guest's nick, then "you" if it is mine.
function Author({ line, mine }: { line: Line; mine: boolean }) {
  return (
    <span className={styles["author"]}>
      <Person name={line.account ?? line.from} guest={line.account === undefined} />
      {mine ? " you" : null}
    </span>
  );
}

// The country a line declares (+gnoworld/country): its code to the eye, as the video's frames 40 and 60 draw it, its name to a reader and a
// screen reader. Any client may write anything there: what is no country draws nothing.
function Country({ code }: { code: string | undefined }) {
  const name = code === undefined || NOT_COUNTRIES.includes(code) ? undefined : REGIONS.of(code);
  if (name === undefined) return null;
  return (
    <span className={styles["country"]} title={name} data-line-country="">
      <span aria-hidden="true">{code}</span>
      <span className="visually-hidden">{name}</span>
    </span>
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
}

// The head: the face, the name, what the line is marked, and the time at the far end.
export function Head({ line, mine, mentioned, saved, pinned }: HeadProps) {
  return (
    <div className={styles["head"]} data-line-head="">
      <Cluster space="2xs">
        <Avatar address={line.account ?? line.from} name={line.from} size="s" decorative />
        <Country code={line.country} />
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

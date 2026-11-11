// A line's head (slice 4's 4b, moved out of LineView.tsx): the face, the name, the marks and the time.
import type { Line, ShownLine } from "@gnoworld/core";
import type { MouseEvent } from "react";
import { Avatar, Cluster, Icon } from "@gnoworld/ui";
import { Country } from "./Country.tsx";
import { Person } from "./Person.tsx";
import { PersonCard } from "./PersonCard.tsx";
import styles from "./RoomView.module.css";

export const CLOCK = new Intl.DateTimeFormat(undefined, { hour: "2-digit", minute: "2-digit", hourCycle: "h23" });

// A line's time in full, its title: the date and the time, in the reader's zone and language.
export const FULL = new Intl.DateTimeFormat(undefined, { dateStyle: "full", timeStyle: "short" });

// A line's author: its account's address shortened or its guest's nick, which opens their card, then "you" if it is mine.
function Author({ line, mine, me }: { line: Line; mine: boolean; me: string | undefined }) {
  const name = line.account ?? line.from;
  const guest = line.account === undefined;
  return (
    <span className={styles["author"]} data-author="">
      <PersonCard name={name} guest={guest} country={line.country} me={me}>
        <Person name={name} guest={guest} />
      </PersonCard>
      {mine ? " you" : null}
    </span>
  );
}

/** Opens the card of the author of the line the focus is in, the keyboard's way to it (the More menu's View profile): their
 * name opens it but is no Tab stop (ae87f64b). The name takes the focus, which the card gives back as it closes, the card
 * the next stop after it. Menu gives More the focus as an item acts. */
export function openAuthorCard(): void {
  const name = document.activeElement?.closest("li")?.querySelector<HTMLButtonElement>("[data-author] > button");
  name?.focus();
  name?.click();
}

// The face opens the author's card as their name does, for a pointer: the keyboard has the name's way (More, View profile).
function openCardFrom(event: MouseEvent<HTMLElement>): void {
  event.currentTarget.parentElement?.querySelector<HTMLButtonElement>("[data-author] > button")?.click();
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
  newHere?: boolean | undefined;
  me: string | undefined;
  line: ShownLine;
  mine: boolean;
  mentioned: boolean;
  saved: boolean;
  pinned: boolean;
  grouped?: boolean;
}

// The head of a line that goes on its author's group: the author for a screen reader alone, the marks it has, and the time in the
// gutter, shown as the line is pointed at or focused.
function GroupedHead({
  line,
  mine,
  me,
  mentioned,
  saved,
  pinned,
}: Pick<HeadProps, "line" | "mine" | "me" | "mentioned" | "saved" | "pinned">) {
  const marked = mentioned || saved || pinned || line.edited === true;
  return (
    <div className={marked ? styles["head"] : undefined} data-line-head="" data-grouped="">
      <span className="visually-hidden">
        <Author line={line} mine={mine} me={me} />
      </span>
      <Marks mentioned={mentioned} notice={false} saved={saved} pinned={pinned} />
      <Edited edited={line.edited} />
      <time dateTime={line.time} title={FULL.format(new Date(line.time))} className={styles["groupTime"]}>
        {CLOCK.format(new Date(line.time))}
      </time>
    </div>
  );
}

// The head: the face, the name, what the line is marked, and the time at the far end.
export function Head({ line, mine, me, mentioned, saved, pinned, newHere, grouped = false }: HeadProps) {
  if (grouped)
    return <GroupedHead line={line} mine={mine} me={me} mentioned={mentioned} saved={saved} pinned={pinned} />;
  return (
    <div className={styles["head"]} data-line-head="">
      <Cluster space="2xs">
        <span className={styles["face"]} data-face="" onClick={openCardFrom}>
          <Avatar address={line.account ?? line.from} name={line.from} size="s" decorative />
        </span>
        <Country code={line.country} />
        {line.kind === "action" ? "* " : null}
        <Author line={line} mine={mine} me={me} />{" "}
        {newHere === true ? <span className={styles["newHere"]}>new here</span> : null}
        <Marks mentioned={mentioned} notice={line.kind === "notice"} saved={saved} pinned={pinned} />
        <Edited edited={line.edited} />
        <time dateTime={line.time} title={FULL.format(new Date(line.time))} className={styles["time"]}>
          {CLOCK.format(new Date(line.time))}
        </time>
      </Cluster>
    </div>
  );
}

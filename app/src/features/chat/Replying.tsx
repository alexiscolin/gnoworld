// What a line answers (slice 4's 4d replies): its author and its words in one line, as the room reads them, cut between
// graphemes, markup kept as text; or an earlier message, when the room no longer holds it.
import { excerpt, type Line } from "@gnoworld/core";
import { Person } from "./Person.tsx";
import styles from "./RoomView.module.css";

/** The line answered, as a reply shows it: its author, an account's or a guest's nick, and its text. */
export interface Answered {
  who: string;
  guest: boolean;
  text: string;
}

export const answeredOf = (line: Line): Answered => ({
  who: line.account ?? line.from,
  guest: line.account === undefined,
  text: line.text,
});

export function Replying({ to, length }: { to: Answered | undefined; length: number }) {
  if (to === undefined) return <>Replying to an earlier message</>;
  return (
    <>
      Replying to <Person name={to.who} guest={to.guest} />: {excerpt(to.text, length)}
    </>
  );
}

// The graphemes a reply quotes of the line it answers (docs/decisions.md, 2026-10-26).
const QUOTED = 70;

// Above a reply, the line it answers, or an earlier message when the room holds it no more; nothing above another line.
export function Quote({ line, answers }: { line: Line; answers: Line | undefined }) {
  if (line.reply === undefined) return null;
  return (
    <p className={styles["replying"]}>
      <Replying to={answers === undefined ? undefined : answeredOf(answers)} length={QUOTED} />
    </p>
  );
}

// A line's words, or a poll's bars, a card or Jarvis's own card in their place, over the room kept for its bar.
import { cardOf, JARVIS_NICK, pollOf, type Line, type Reacting } from "@gnoworld/core";
import type { ReactNode } from "react";
import { JarvisSaidSlot } from "./JarvisSaidSlot.tsx";
import { PollView } from "./PollView.tsx";
import { SharedCard } from "./SharedCard.tsx";
import styles from "./RoomView.module.css";

interface LineBodyProps {
  line: Line;
  /** A poll line's votes, as votesString writes them; none for a line that is no poll. */
  votes: string | undefined;
  react: ((reaction: Reacting) => boolean) | undefined;
  /** Whether a link's player, and so a card, is offered. */
  players: boolean;
  /** The room it is in; none for a thread's own row. */
  room: string | undefined;
  children: ReactNode;
}

// The card a message's words are (core's cardLine.ts): where a player is offered alone, which a direct message and a reader who saves data are
// not given, the card fetching its own data.
const cardIn = ({ kind, text }: Line, players: boolean): ReturnType<typeof cardOf> =>
  kind === "message" && players ? cardOf(text) : undefined;

// The line Jarvis said is told by its nick alone, which only the relay sets and no account can take: a name that merely ends so is a person's.
const said = ({ from, account }: Line): boolean => from === JARVIS_NICK && account === undefined;

export function LineBody({ line, votes, react, players, room, children }: LineBodyProps) {
  const poll = votes === undefined ? undefined : pollOf(line.text);
  const card = cardIn(line, players);
  let drawn = children;
  if (card !== undefined) drawn = <SharedCard card={card} />;
  else if (poll !== undefined) drawn = <PollView to={line.id} poll={poll} votes={votes ?? ""} react={react} />;
  else if (room !== undefined && said(line))
    drawn = (
      <JarvisSaidSlot room={room} msgid={line.id}>
        {children}
      </JarvisSaidSlot>
    );
  return (
    <div data-line-text="" className={votes === undefined && card === undefined ? undefined : styles["wide"]}>
      {drawn}
    </div>
  );
}

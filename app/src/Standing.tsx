// A plate's standing (D530): what the place is doing, in one hero figure and a few small ones. The hero is chosen by the place's state
// (the page's: a world's people, a realm's calls or its age); a figure no source gave is left out, never a zero. A note says in one
// line what the figures cannot (a realm nobody called). Its box is the plate's own element, so the arrival rises it whatever comes in.
import { Stat, type StatProps } from "@gnoworld/ui";
import type { ReactNode } from "react";
import { useHere } from "./useHere.ts";
import styles from "./Standing.module.css";

export interface StandingProps {
  hero?: StatProps | undefined;
  /** The small figures. */
  rest?: readonly StatProps[];
  /** One line under the figures: what they cannot say. */
  note?: string | undefined;
}

const NONE: readonly StatProps[] = [];

/** The standing's box, empty while nothing is drawn in it. */
export function StandingBox({ children }: { children?: ReactNode }) {
  return <div className={styles["standing"]}>{children}</div>;
}

/** The figures, drawn in a standing's box. */
export function Figures({ hero, rest = NONE, note }: StandingProps) {
  return (
    <>
      {hero === undefined ? null : (
        <div className={styles["hero"]}>
          <Stat {...hero} />
        </div>
      )}
      {rest.length === 0 ? null : (
        <div className={styles["rest"]}>
          {rest.map((figure) => (
            <Stat key={figure.caption} {...figure} />
          ))}
        </div>
      )}
      {note === undefined ? null : <p className={styles["note"]}>{note}</p>}
    </>
  );
}

const Standing = (props: StandingProps) => (
  <StandingBox>
    <Figures {...props} />
  </StandingBox>
);

// A source says a count when it gives a finite number of 0 or more; a rate is shown as a whole number, as the frames do.
const count = (given: number | undefined) =>
  given !== undefined && Number.isFinite(given) && given >= 0 ? Math.round(given) : undefined;

/** A world's crowd: the people the server counts in it, the hero while there are some; the messages an hour are the activity's
 * own line, never said twice (D534). Nobody counted, nothing drawn (Alexis, 2026-11-03, "retire le vide"), then the page's own `rest`. */
export function Crowd({
  world,
  rest = NONE,
  note,
}: {
  world: string;
  rest?: readonly StatProps[];
  /** What the place has none of, in a line. */
  note?: string;
}) {
  const here = count(useHere(true).get(world)) ?? 0;
  const hero: StatProps | undefined =
    here > 0 ? { value: here, unit: "here", caption: "right now", icon: "people" } : undefined;
  return <Standing hero={hero} rest={rest} note={note} />;
}

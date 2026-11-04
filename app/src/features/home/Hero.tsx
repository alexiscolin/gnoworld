// The home's hero (frames 1 to 8): the kicker, the big number, its line and the two big actions. The number counts the worlds the page
// gives it, the cosmos's or a universe's list: no sample, none while none is known, and no count of people online while no source says so.
import { Icon, Kicker } from "@gnoworld/ui";
import type { ReactNode } from "react";
import { Link } from "react-router";
import type { UniverseView } from "../../places.ts";
import { GoExplore } from "./GoExplore.tsx";
import styles from "./Hero.module.css";
import { Live } from "./Live.tsx";

// ADR-0003 §2, 2a: what a world is, after the count; nothing of it where the universe holds none.
const TALK = ". Each one is a place to talk.";

// The line's count, its figure and its word: the figure's room kept while the number comes (7n). While it comes, a page read with no script
// says "Worlds in", a sentence (F4641); the stylesheet draws the count's word.
function Count({ worlds }: { worlds: number | undefined }) {
  return (
    <strong className={styles["count"]}>
      <span className={styles["figure"]} data-hero="figure">
        {worlds}
      </span>
      {worlds === undefined ? (
        <span className={styles["coming"]}>Worlds</span>
      ) : (
        ` ${worlds === 1 ? "world" : "worlds"}`
      )}
    </strong>
  );
}

/** `coming`: no number yet, but one is on its way (the worlds' count is being read). `newcomer`: the reader has entered no place yet, so the
 * Earth's label says "Start here", the one filled call (ADR-0003 §3). */
export function Hero({
  universe,
  worlds,
  coming = false,
  newcomer = false,
}: {
  universe: UniverseView;
  worlds: number | undefined;
  coming?: boolean;
  newcomer?: boolean;
}) {
  return (
    // The opening's words over the dive take its place while they show (mock-up 1), which the opening marks (ADR-0003 §1).
    <div className={styles["hero"]} data-clear="" data-yield="none">
      <Kicker dot="warm">{universe.isDefault ? "gno.world" : universe.name}</Kicker>
      {/* A figure space keeps the number's line while none is known: the page does not jump when it comes. */}
      <p className={styles["number"]} data-hero="number">
        {worlds ?? "\u2007"}
      </p>
      <div className={styles["row"]}>
        {/* The line keeps its figure's room while the number comes, so the actions beside it stay put (7n); with none, it names the worlds.
            The page's heading is its count; what a world is follows it, on the same line. */}
        <div className={styles["line"]} data-hero="line">
          <h1 className={styles["heading"]} tabIndex={-1}>
            {worlds === undefined && !coming ? (
              `Worlds in ${universe.name}`
            ) : (
              <>
                <Count worlds={worlds} />
                {` in ${universe.name}`}
              </>
            )}
          </h1>
          {worlds === 0 ? null : TALK}
        </div>
        {/* The video's pair (frame 4): Go explore filled, then Join the chat, the Earth's general room. */}
        {/* The universe marks whether the cosmos stands beside them, where the Earth's label says "Start here" to a newcomer. */}
        <div
          className={styles["actions"]}
          data-hero="actions"
          data-first={newcomer ? "" : undefined}
          data-cosmos="none"
        >
          <GoExplore
            places={{ earth: universe.earth.path, worlds: universe.worlds, universe: universe.id }}
            className={styles["action"]}
          />
          <Link to={universe.earth.path} className={styles["action"]} data-call="chat">
            Join the chat
            <Icon name="arrow" />
          </Link>
        </div>
      </div>
      <Live withBlock={universe.isDefault} />
    </div>
  );
}

/** The universe's worlds, as the page lists them, beside the hero's left edge, under their kicker (ADR-0003, 2d); from 900 px the cosmos's
 * rail stands for them while it stands (7i), and marks them so. */
export function Worlds({ children }: { children: ReactNode }) {
  return (
    <nav aria-label="Worlds" className={styles["worlds"]} data-rail="none" data-yield="none">
      <Kicker>Worlds</Kicker>
      {children}
    </nav>
  );
}

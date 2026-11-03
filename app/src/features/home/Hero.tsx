// The home's hero (frames 1 to 8): the kicker, the big number, its line and the two big actions. The number counts the worlds the page
// gives it, the cosmos's or a universe's list: no sample, none while none is known, and no count of people online while no source says so.
import { Icon, Kicker } from "@gnoworld/ui";
import type { ReactNode } from "react";
import { Link } from "react-router";
import type { UniverseView } from "../../places.ts";
import styles from "./Hero.module.css";
import { Live } from "./Live.tsx";

/** `coming`: no number yet, but one is on its way (the worlds' file is being read). */
export function Hero({
  universe,
  worlds,
  coming = false,
}: {
  universe: UniverseView;
  worlds: number | undefined;
  coming?: boolean;
}) {
  return (
    <div className={styles["hero"]} data-clear="">
      <Kicker dot="warm">{universe.isDefault ? "gno.world" : universe.name}</Kicker>
      {/* A figure space keeps the number's line while none is known: the page does not jump when it comes. */}
      <p className={styles["number"]} data-hero="number">
        {worlds ?? "\u2007"}
      </p>
      <div className={styles["row"]}>
        {/* The line keeps its figure's room while the number comes, so the actions beside it stay put (7n); with none, it names the worlds. */}
        <h1 className={styles["line"]} tabIndex={-1}>
          {worlds === undefined && !coming ? (
            `Worlds in ${universe.name}`
          ) : (
            <>
              <span className={styles["figure"]} data-hero="figure">
                {worlds}
              </span>
              {` ${worlds === 1 ? "world" : "worlds"} in ${universe.name}`}
            </>
          )}
        </h1>
        <div className={styles["actions"]} data-hero="actions">
          <Link to={universe.earth.path} className={styles["action"]} data-emphasis="solid">
            Go explore
            <Icon name="arrow" />
          </Link>
          <Link to="/list" className={styles["action"]}>
            See the list
            <Icon name="arrow" />
          </Link>
        </div>
      </div>
      <Live withBlock={universe.isDefault} />
    </div>
  );
}

/** The universe's worlds, as the page lists them, beside the hero's left edge until the planets of slice 7 stand for them. */
export function Worlds({ children }: { children: ReactNode }) {
  return (
    <nav aria-label="Worlds" className={styles["worlds"]}>
      {children}
    </nav>
  );
}

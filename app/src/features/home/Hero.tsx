// The home's hero (frames 1 to 8): the kicker, the big number, its line and the two big actions. The number counts what the data
// holds, the worlds of the universe: no sample, and no count of people online while no source says so (slice 5m fills the rest).
import { Icon, Kicker } from "@gnoworld/ui";
import type { ReactNode } from "react";
import { Link } from "react-router";
import type { UniverseView } from "../../places.ts";
import styles from "./Hero.module.css";
import { Live } from "./Live.tsx";

export function Hero({ universe }: { universe: UniverseView }) {
  const count = universe.worlds.length;
  return (
    <div className={styles["hero"]}>
      <Kicker dot="warm">{universe.isDefault ? "gno.world" : universe.name}</Kicker>
      <p className={styles["number"]} data-hero="number">
        {count}
      </p>
      <div className={styles["row"]}>
        <h1 className={styles["line"]}>
          {count} {count === 1 ? "world" : "worlds"} in {universe.name}
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
      <Live rpc={universe.rpc} />
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

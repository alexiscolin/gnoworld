// The home's hero (frames 1 to 8): the big number, its line and the two big actions. The number counts what the data holds, the
// worlds of the universe: no sample, and no count of people online while no source says so (slice 5m fills the rest of the row).
import { Cluster, Icon, Stack } from "@gnoworld/ui";
import { Link } from "react-router";
import type { UniverseView } from "../../places.ts";
import styles from "./Hero.module.css";

export function Hero({ universe }: { universe: UniverseView }) {
  const count = universe.worlds.length;
  return (
    <div className={styles["hero"]}>
      <Stack space="m">
        <div className="label">
          <h1>{universe.isDefault ? "gno.world" : universe.name}</h1>
        </div>
        <p className={styles["number"]} data-hero="number">
          {count}
        </p>
        <p className={styles["line"]}>
          {count} {count === 1 ? "world" : "worlds"} in {universe.name}
        </p>
        <div data-hero="actions">
          <Cluster space="2xs">
            <Link to={universe.earth.path} className={styles["action"]} data-emphasis="solid">
              Go explore
              <Icon name="arrow" />
            </Link>
            <Link to="/list" className={styles["action"]}>
              See the list
              <Icon name="arrow" />
            </Link>
          </Cluster>
        </div>
      </Stack>
    </div>
  );
}

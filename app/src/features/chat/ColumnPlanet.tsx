// A world's planet in the chat's column of worlds: its picture at 44 px, else the planet drawn from its seed once it is, else ui's disc.
import { PlanetThumb } from "@gnoworld/ui";
import { useWorldThumb } from "../../worldThumbs.ts";
import styles from "./Worlds.module.css";

// The disc stands in the same 44 px box as the picture, so the column never moves when the picture comes.
// The picture at 44 px, loaded lazily as the column is (ui's disc is the rail's too, in the first screen, so it carries no such attributes).
export function ColumnPlanet({ name, id, src }: { name: string; id: string; src: string | undefined }) {
  const { ref, src: drawn } = useWorldThumb(id);
  const shown = src ?? drawn;
  if (shown === undefined)
    return (
      <span ref={ref} className={styles["planet"]}>
        <PlanetThumb src="" name={name} decorative />
      </span>
    );
  return (
    <span className={styles["planet"]}>
      <img src={shown} alt="" width={44} height={44} loading="lazy" decoding="async" className={styles["picture"]} />
    </span>
  );
}

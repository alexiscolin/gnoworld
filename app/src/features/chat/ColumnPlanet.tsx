// A world's planet in the chat's column of worlds: its picture at 44 px, else the planet drawn from its seed once it is, else ui's disc.
import { PlanetThumb } from "@gnoworld/ui";
import { hubWorldOf } from "@gnoworld/core";
import { useEffect } from "react";
import { pictureOf } from "../../lib/worldPictures.ts";
import { useWorldThumb } from "../../worldThumbs.ts";
import styles from "./Worlds.module.css";

// The pictures this tab has drawn: loaded once, in memory, so a column drawn again (the dock's, then the full chat's) shows them in its first
// frame, never an empty box till the file is decoded again. A few at once: the column is a shelf the reader scrolls.
const KEPT_MOST = 24;
const kept = new Map<string, HTMLImageElement>();

function keep(src: string): void {
  if (kept.has(src) || kept.size >= KEPT_MOST) return;
  const image = new Image();
  image.src = src;
  kept.set(src, image);
  image.addEventListener("error", () => {
    kept.delete(src);
  });
}

/** Loads the pictures of the first of `worlds` ahead, while the chat is docked and its column not drawn: the full chat's column then shows them
 * in its first frame. */
export function warmPictures(worlds: readonly { slug: string; realms?: readonly string[] | undefined }[]): void {
  for (const world of worlds) {
    const src = pictureOf(hubWorldOf(world));
    if (src !== undefined) keep(src);
  }
}

// The disc stands in the same 44 px box as the picture, so the column never moves when the picture comes.
// The picture at 44 px, loaded lazily as the column is (ui's disc is the rail's too, in the first screen, so it carries no such attributes).
export function ColumnPlanet({ name, id, src }: { name: string; id: string; src: string | undefined }) {
  const { ref, src: drawn } = useWorldThumb(id);
  const shown = src ?? drawn;
  useEffect(() => {
    if (shown !== undefined) keep(shown);
  }, [shown]);
  if (shown === undefined)
    return (
      <span ref={ref} className={styles["planet"]}>
        <PlanetThumb src="" name={name} decorative />
      </span>
    );
  return (
    <span className={styles["planet"]}>
      <img
        src={shown}
        alt=""
        width={44}
        height={44}
        loading={kept.get(shown)?.complete === true ? "eager" : "lazy"}
        decoding={kept.get(shown)?.complete === true ? "sync" : "async"}
        className={styles["picture"]}
      />
    </span>
  );
}

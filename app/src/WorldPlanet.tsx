// A world's thumb: the picture the scene took of its planet, else the planet drawn from its seed once it is, else `fallback`. One component
// for a world's picture wherever it shows: the rail, the palette, the plate, and the chat's column of worlds.
import { PlanetThumb, type PlanetThumbProps } from "@gnoworld/ui";
import { hubWorldOf } from "@gnoworld/core";
import { useEffect } from "react";
import { pictureOf } from "./lib/worldPictures.ts";
import { useWorldPicture } from "./worldThumbs.ts";

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

export function WorldPlanet({
  world,
  fallback,
  ...thumb
}: { world: string; fallback: string } & Omit<PlanetThumbProps, "src">) {
  const { ref, src } = useWorldPicture(world);
  useEffect(() => {
    if (src !== undefined) keep(src);
  }, [src]);
  return (
    <span ref={ref} style={{ display: "contents" }}>
      <PlanetThumb src={src ?? fallback} {...thumb} />
    </span>
  );
}

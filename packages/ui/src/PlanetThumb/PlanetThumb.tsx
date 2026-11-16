import { Planet } from "../Planet/Planet.tsx";
import styles from "./PlanetThumb.module.css";

export interface PlanetThumbProps {
  /** The picture, from the site: an image from another host shows each visitor's address to it. */
  src: string;
  /** The place's name: the picture's words, unless it is decorative. */
  name: string;
  kind?: "world" | "cluster" | "star" | "station" | "signal";
  size?: "s" | "m" | "l";
  /** Beside its name already, as in a row: the picture says nothing more. */
  decorative?: boolean;
  /** Grows by the dock's magnification its list writes on it as `--_mag`, as a dock's planets do; never under reduced motion. */
  magnify?: boolean;
}

/**
 * Only the site's own pictures are drawn: a path from the site's root (not `//host`, not `/\host`, no control
 * character the browser would strip before reading it) or an image data URI. Anything else, whatever the caller or
 * its data file says, asks nobody: the drawn fallback stands in.
 */
function isOwn(src: string): boolean {
  // A control character is what the browser strips to read `//host` through it.
  for (const char of src) if ((char.codePointAt(0) ?? 0) <= 0x1f || char === "\u007f") return false;
  if (/^data:image\//i.test(src)) return true;
  return /^\/(?![\\/])/.test(src);
}

/** A place's picture in a disc, its edge by its kind. */
export function PlanetThumb({ src, name, kind = "world", size = "m", decorative = false, magnify }: PlanetThumbProps) {
  const own = isOwn(src);
  return (
    <span
      data-fallback={own ? undefined : ""}
      className={styles["thumb"]}
      data-kind={kind}
      data-size={size}
      data-magnify={magnify === true ? "" : undefined}
    >
      {own ? (
        <img
          src={src}
          alt={decorative ? "" : name}
          referrerPolicy="no-referrer"
          loading="lazy"
          decoding="async"
          className={styles["picture"]}
        />
      ) : (
        // The fallback asks nobody: the design system's Planet, in the place's colour, named as the picture was.
        <span
          role={decorative ? undefined : "img"}
          aria-label={decorative ? undefined : name}
          className={styles["picture"]}
        >
          <Planet name={name} fill />
        </span>
      )}
    </span>
  );
}

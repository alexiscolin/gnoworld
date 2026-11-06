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
 * Only the site's own pictures are drawn (F336): a path from the site's root (not `//host`, not `/\host`, no control
 * character the browser would strip before reading it) or an image data URI. Anything else, whatever the caller or
 * its data file says, asks nobody: the drawn fallback stands in.
 */
function isOwn(src: string): boolean {
  // A control character is what the browser strips to read `//host` through it.
  for (const char of src) if ((char.codePointAt(0) ?? 0) <= 0x1f || char === "\u007f") return false;
  if (/^data:image\//i.test(src)) return true;
  return /^\/(?![\\/])/.test(src);
}

const FALLBACK = `data:image/svg+xml,${encodeURIComponent(
  "<svg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 64 64'><defs><radialGradient id='g' cx='35%' cy='30%'>" +
    "<stop offset='0' stop-color='#8fa3c7'/><stop offset='1' stop-color='#2a3350'/></radialGradient></defs>" +
    "<rect width='64' height='64' fill='url(#g)'/></svg>",
)}`;

/** A place's picture in a disc, its edge by its kind. Slice 7 draws it from the planet's own look. */
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
      <img
        src={own ? src : FALLBACK}
        alt={decorative ? "" : name}
        referrerPolicy="no-referrer"
        className={styles["picture"]}
      />
    </span>
  );
}

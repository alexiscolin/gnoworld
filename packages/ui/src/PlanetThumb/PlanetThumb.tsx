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
  /** Grows under the pointer, as the dock's planets do; never under reduced motion. */
  magnify?: boolean;
}

/** A place's picture in a disc, its edge by its kind. Slice 7 draws it from the planet's own look. */
export function PlanetThumb({ src, name, kind = "world", size = "m", decorative = false, magnify }: PlanetThumbProps) {
  return (
    <span
      className={styles["thumb"]}
      data-kind={kind}
      data-size={size}
      data-magnify={magnify === true ? "" : undefined}
    >
      <img src={src} alt={decorative ? "" : name} className={styles["picture"]} />
    </span>
  );
}

import styles from "./compositions.module.css";
import { place, type Composed } from "./place.tsx";

export interface ClusterProps extends Composed {
  justify?: "start" | "center" | "between" | "end";
  /** Centred on the cross axis unless asked. */
  align?: "center" | "baseline" | "end";
  /** Wraps unless it is "no": a row whose parts never drop to a second line. */
  wrap?: "yes" | "no";
}

/** Its children in a row that wraps, a space step apart, lined up as asked. */
export function Cluster({ justify = "start", align = "center", wrap = "yes", ...rest }: ClusterProps) {
  return place({
    ...rest,
    className: styles["cluster"],
    own: { "data-justify": justify, "data-align": align, "data-wrap": wrap },
  });
}

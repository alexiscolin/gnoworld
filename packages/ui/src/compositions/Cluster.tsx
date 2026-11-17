import styles from "./compositions.module.css";
import { place, type Composed } from "./place.tsx";

export interface ClusterProps extends Composed {
  justify?: "start" | "center" | "between" | "end";
  /** Centred on the cross axis unless asked. */
  align?: "center" | "baseline" | "end";
  /** Wraps unless it is "no": a row whose parts never drop to a second line; "scroll" wraps wide and scrolls across inside itself on a phone. */
  wrap?: "yes" | "no" | "scroll";
}

/** Its children in a row that wraps, a space step apart, lined up as asked. */
export function Cluster({ justify = "start", align = "center", wrap = "yes", ...rest }: ClusterProps) {
  return place({
    ...rest,
    composition: styles["cluster"],
    own: { "data-justify": justify, "data-align": align, "data-wrap": wrap },
  });
}

import styles from "./compositions.module.css";
import { place, type Composed } from "./place.tsx";

export interface ClusterProps extends Composed {
  justify?: "start" | "center" | "between" | "end";
}

/** Its children in a row that wraps, a space step apart, lined up as asked. */
export function Cluster({ justify = "start", ...rest }: ClusterProps) {
  return place({ ...rest, className: styles["cluster"], own: { "data-justify": justify } });
}

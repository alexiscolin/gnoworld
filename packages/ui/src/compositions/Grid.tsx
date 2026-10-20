import styles from "./compositions.module.css";
import { place, type Composed } from "./place.tsx";

export interface GridProps extends Composed {
  min?: "s" | "m" | "l";
}

/** Columns as many as fit, each at least a column token wide. */
export function Grid({ min = "m", ...rest }: GridProps) {
  return place({ ...rest, className: styles["grid"], own: { "data-min": min } });
}

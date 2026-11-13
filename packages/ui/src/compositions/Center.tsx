import styles from "./compositions.module.css";
import { place, type Composed } from "./place.tsx";

export interface CenterProps extends Composed {
  max?: "measure" | "page";
}

/** Its content centred at a reading measure, or the whole page, its inline gutter a space step. */
export function Center({ max = "measure", ...rest }: CenterProps) {
  return place({ ...rest, composition: styles["center"], own: { "data-max": max } });
}

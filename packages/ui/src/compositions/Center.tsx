import styles from "./compositions.module.css";
import { place, type Composed } from "./place.tsx";

export interface CenterProps extends Composed {
  max?: "measure" | "dialog" | "page";
}

/** Its content centred at a reading measure or a dialog's width, or the whole page, its gutter a space step. */
export function Center({ max = "measure", ...rest }: CenterProps) {
  return place({ ...rest, className: styles["center"], own: { "data-max": max } });
}

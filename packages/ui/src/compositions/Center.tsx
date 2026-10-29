import styles from "./compositions.module.css";
import { place, type Composed } from "./place.tsx";

export interface CenterProps extends Composed {
  max?: "measure" | "dialog" | "page";
  /** Its space step on the inline edges only, or on the block ones too (a header against the viewport's top). */
  gutter?: "inline" | "all";
}

/** Its content centred at a reading measure or a dialog's width, or the whole page, its gutter a space step. */
export function Center({ max = "measure", gutter = "inline", ...rest }: CenterProps) {
  return place({ ...rest, className: styles["center"], own: { "data-max": max, "data-gutter": gutter } });
}

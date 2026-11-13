import styles from "./compositions.module.css";
import { place, type Composed } from "./place.tsx";

export type SwitcherProps = Composed;

/** Its children in a row, or all one under the other once the row is narrower than a measure. */
export function Switcher(props: SwitcherProps) {
  return place({ ...props, composition: styles["switcher"] });
}

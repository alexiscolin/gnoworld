import styles from "./compositions.module.css";
import { place, type Composed } from "./place.tsx";

export type StackProps = Composed;

/** Its children one under the other, a space step apart. */
export function Stack(props: StackProps) {
  return place({ ...props, className: styles["stack"] });
}

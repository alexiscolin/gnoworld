import styles from "./compositions.module.css";
import { place, type Composed } from "./place.tsx";

export interface StackProps extends Composed {
  /** Where the children sit in a taller box: at the start unless asked. */
  justify?: "start" | "center";
}

/** Its children one under the other, a space step apart. */
export function Stack({ justify = "start", ...rest }: StackProps) {
  return place({ ...rest, composition: styles["stack"], own: { "data-justify": justify } });
}

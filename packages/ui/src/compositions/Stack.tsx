import type { ReactNode } from "react";
import styles from "./compositions.module.css";
import { place, type Box, type Space } from "./place.tsx";

export interface StackProps {
  children: ReactNode;
  space?: Space;
  as?: Box;
}

/** Its children one under the other, a space step apart. */
export function Stack({ children, space = "s", as = "div" }: StackProps) {
  return place({ as, className: styles["stack"], attributes: { "data-space": space }, children });
}

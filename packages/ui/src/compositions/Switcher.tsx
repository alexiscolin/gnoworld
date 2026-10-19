import type { ReactNode } from "react";
import styles from "./compositions.module.css";
import { place, type Box, type Space } from "./place.tsx";

export interface SwitcherProps {
  children: ReactNode;
  space?: Space;
  as?: Box;
}

/** Its children in a row, or all one under the other once the row is narrower than a measure. */
export function Switcher({ children, space = "s", as = "div" }: SwitcherProps) {
  return place({ as, className: styles["switcher"], attributes: { "data-space": space }, children });
}

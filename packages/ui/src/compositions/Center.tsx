import type { ReactNode } from "react";
import styles from "./compositions.module.css";
import { place, type Box, type Space } from "./place.tsx";

export interface CenterProps {
  children: ReactNode;
  space?: Space;
  as?: Box;
  max?: "measure" | "dialog";
}

/** Its content centred at a reading measure or a dialog's width, its gutter a space step. */
export function Center({ children, space = "s", as = "div", max = "measure" }: CenterProps) {
  return place({ as, className: styles["center"], attributes: { "data-space": space, "data-max": max }, children });
}

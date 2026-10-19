import type { ReactNode } from "react";
import styles from "./compositions.module.css";
import { place, type Box, type Space } from "./place.tsx";

export interface GridProps {
  children: ReactNode;
  space?: Space;
  as?: Box;
  min?: "s" | "m" | "l";
}

/** Columns as many as fit, each at least a column token wide. */
export function Grid({ children, space = "s", as = "div", min = "m" }: GridProps) {
  return place({ as, className: styles["grid"], attributes: { "data-space": space, "data-min": min }, children });
}

import type { ReactNode } from "react";
import styles from "./compositions.module.css";
import { place, type Box, type Space } from "./place.tsx";

export interface ClusterProps {
  children: ReactNode;
  space?: Space;
  as?: Box;
  justify?: "start" | "center" | "between" | "end";
}

/** Its children in a row that wraps, a space step apart, lined up as asked. */
export function Cluster({ children, space = "s", as = "div", justify = "start" }: ClusterProps) {
  return place({
    as,
    className: styles["cluster"],
    attributes: { "data-space": space, "data-justify": justify },
    children,
  });
}

import type { ReactNode } from "react";
import styles from "./compositions.module.css";
import { place, type Box, type Space } from "./place.tsx";

export interface SidebarProps {
  children: ReactNode;
  space?: Space;
  as?: Box;
  side?: "start" | "end";
}

/** A side and a main part side by side, stacked once the main part would fall under half. */
export function Sidebar({ children, space = "s", as = "div", side = "start" }: SidebarProps) {
  return place({ as, className: styles["sidebar"], attributes: { "data-space": space, "data-side": side }, children });
}

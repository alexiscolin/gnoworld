import styles from "./compositions.module.css";
import { place, type Composed } from "./place.tsx";

export interface SidebarProps extends Composed {
  side?: "start" | "end";
}

/** A side and a main part side by side, stacked once the main part would fall under half. */
export function Sidebar({ side = "start", ...rest }: SidebarProps) {
  return place({ ...rest, className: styles["sidebar"], own: { "data-side": side } });
}

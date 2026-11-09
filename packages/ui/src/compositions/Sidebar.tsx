import styles from "./compositions.module.css";
import { place, type Composed } from "./place.tsx";

export interface SidebarProps extends Composed {
  side?: "start" | "end";
  /** The two parts on their tops (the default) or on one middle line: a title and its close, a field and its control. */
  align?: "start" | "center";
}

/** A side and a main part side by side, stacked once the main part would fall under half. */
export function Sidebar({ side = "start", align = "start", ...rest }: SidebarProps) {
  return place({ ...rest, className: styles["sidebar"], own: { "data-side": side, "data-align": align } });
}

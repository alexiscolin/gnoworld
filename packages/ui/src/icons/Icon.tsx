import { GLYPHS } from "./glyphs.tsx";
import styles from "./Icon.module.css";

export type IconName = keyof typeof GLYPHS;
export interface IconProps {
  name: IconName;
  size?: "m" | "l";
}

// The icons that point along the text: they turn right to left (docs/DESIGN-SYSTEM.md, "Icons").
const DIRECTIONAL = new Set<IconName>(["arrow", "arrow-up-right", "reply", "list-bulleted", "list-numbered", "quote"]);

export const ICON_NAMES = Object.keys(GLYPHS) as IconName[];

/** An icon, hidden from assistive technology: the control around it carries the words. */
export function Icon({ name, size = "m" }: IconProps) {
  return (
    <svg
      viewBox="0 0 16 16"
      aria-hidden="true"
      className={styles["icon"]}
      data-icon={name}
      data-size={size}
      data-mirror={DIRECTIONAL.has(name) ? "" : undefined}
      fill="none"
      stroke="currentColor"
      strokeWidth={1.5}
      strokeLinecap="round"
      strokeLinejoin="round"
    >
      {GLYPHS[name]}
    </svg>
  );
}

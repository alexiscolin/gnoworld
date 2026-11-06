import type { ReactNode } from "react";
import styles from "./Kicker.module.css";

export interface KickerProps {
  children: ReactNode;
  dot?: "warm" | "mine" | "signal" | "world";
  vertical?: boolean;
}

/** The line above a title, in the one label style; vertical, the plate's atlas caption. */
export function Kicker({ children, dot, vertical }: KickerProps) {
  return (
    <p className={["label", styles["kicker"]].join(" ")} data-orientation={vertical === true ? "vertical" : undefined}>
      {dot === undefined ? null : <span className="dot" data-tone={dot} aria-hidden="true" />}
      {children}
    </p>
  );
}

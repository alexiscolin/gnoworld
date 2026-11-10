import type { ReactNode } from "react";
import { Cluster } from "../compositions/index.ts";
import { Planet } from "../Planet/Planet.tsx";
import styles from "./Kicker.module.css";

export interface KickerProps {
  children: ReactNode;
  dot?: "warm" | "mine" | "signal" | "world";
  vertical?: boolean;
  /** The plate's own: the place's planet, a small lit disc in its colour, before the words, in a row as tall as the plate's header controls. */
  planet?: boolean;
}

/** The line above a title, in the one label style; vertical, the plate's atlas caption. */
export function Kicker({ children, dot, vertical, planet }: KickerProps) {
  if (planet === true) {
    return (
      <div className={styles["row"]} data-planet="">
        <Cluster space="xs" wrap="no">
          <Planet />
          <p className="label">{children}</p>
        </Cluster>
      </div>
    );
  }
  return (
    <p className={["label", styles["kicker"]].join(" ")} data-orientation={vertical === true ? "vertical" : undefined}>
      {dot === undefined ? null : <span className="dot" data-tone={dot} aria-hidden="true" />}
      {children}
    </p>
  );
}

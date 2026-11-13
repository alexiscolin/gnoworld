import type { CSSProperties } from "react";
import { nameColour } from "./nameColour.ts";
import styles from "./Planet.module.css";

export interface PlanetProps {
  /** A name whose hue colours the disc, so a name keeps its colour; none: the plate's own world colour. */
  name?: string;
}

/** A planet's stand-in beside a name (the proposal's .planet): the world's colour lit from the upper left. A picture replaces it once the scene gives one. */
export function Planet({ name }: PlanetProps) {
  return (
    <span
      className={["disc", styles["planet"]].join(" ")}
      style={name === undefined ? undefined : ({ "--world": nameColour(name) } as CSSProperties)}
      data-world={name === undefined ? undefined : ""}
      aria-hidden="true"
    />
  );
}

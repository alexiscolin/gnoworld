import type { CSSProperties } from "react";
import styles from "./Planet.module.css";

export interface PlanetProps {
  /** A name whose hue colours the disc, so a name keeps its colour; none: the plate's own world colour. */
  name?: string;
}

function hueOf(name: string): number {
  let hue = 0;
  for (let at = 0; at < name.length; at += 1) hue = (hue * 31 + name.charCodeAt(at)) % 360;
  return hue;
}

/** A planet's stand-in beside a name (the proposal's .planet): the world's colour lit from the upper left. A picture replaces it once the scene gives one. */
export function Planet({ name }: PlanetProps) {
  return (
    <span
      className={["disc", styles["planet"]].join(" ")}
      style={name === undefined ? undefined : ({ "--world": `hsl(${String(hueOf(name))} 55% 68%)` } as CSSProperties)}
      aria-hidden="true"
    />
  );
}

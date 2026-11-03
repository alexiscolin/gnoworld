// The flight panel (ADR-0002 §1, "Flight panel"; frames 18, 36, 88, 89, 101, 128, 142): under the header in the middle, what the flight is
// doing, its target and three instruments, and a bar for how far it has gone. For the eye alone: the page it lands on tells readers where
// they are, and its figures change ten times a second.
import type { FlightPhase } from "@gnoworld/core";
import type { CSSProperties } from "react";
import type { FlightSaid } from "../../scene/flight/flights.ts";
import styles from "./FlightPanel.module.css";

const PHASES: Record<FlightPhase, string> = {
  leaving: "Course plotted · leaving orbit",
  transit: "In transit",
  entering: "Entering orbit",
};

// How far along, as the bar's share of its track: never past either end.
const share = (along: number) => String(along > 0 ? Math.min(along, 1) : 0);

export function FlightPanel({ flight }: { flight: FlightSaid | undefined }) {
  if (flight === undefined) return null;
  const { target, phase, distance, speed, eta, along } = flight;
  const bar = { "--_along": share(along) } as CSSProperties;
  return (
    <section className={styles["panel"]} data-flight="" aria-hidden="true">
      <p className={`label ${String(styles["phase"])}`} data-phase="">
        {PHASES[phase]}
      </p>
      <dl className={styles["instruments"]}>
        <div className={styles["instrument"]}>
          <dt className="label">Target</dt>
          <dd className="truncate">{target}</dd>
        </div>
        <div className={styles["detail"]}>
          <dt className="label">Distance</dt>
          <dd className="truncate">{distance.toFixed(2)} AU</dd>
        </div>
        <div className={styles["detail"]}>
          <dt className="label">Speed</dt>
          <dd className="truncate">{Math.round(speed).toLocaleString("en-US")} km/s</dd>
        </div>
        <div className={styles["instrument"]}>
          <dt className="label">ETA</dt>
          <dd className="truncate">{eta.toFixed(1)} s</dd>
        </div>
      </dl>
      <div className={styles["bar"]} data-along="" style={bar} />
    </section>
  );
}

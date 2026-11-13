// The open proposal's status round its realm's planet (5k, statusRing.ts): the yes share lit from the top, the no share after it, the
// threshold a tick; drawn only where the realm reports a tally (gnoworld invents no timer). An SVG in the page's globe box, as wide as the
// ring the layout keeps for it (1.106 radii, globe.module.css), so it follows the planet wherever the page lays it out.
import type { Ring } from "./statusRing.ts";
import styles from "./StatusRing.module.css";

// The ring's radius in its 100-unit box, and its length.
const R = 49;
const ROUND = 2 * Math.PI * R;

export function StatusRing({ ring }: { ring: Ring }) {
  const lit = ring.lit * ROUND;
  const against = (ring.against ?? 0) * ROUND;
  const tick = ring.mark === undefined ? undefined : ring.mark * 2 * Math.PI;
  return (
    <svg viewBox="0 0 100 100" className={styles["ring"]} aria-hidden="true">
      <circle cx="50" cy="50" r={R} className={styles["track"]} />
      <circle cx="50" cy="50" r={R} className={styles["yes"]} strokeDasharray={`${String(lit)} ${String(ROUND)}`} />
      {against > 0 ? (
        <circle
          cx="50"
          cy="50"
          r={R}
          className={styles["no"]}
          strokeDasharray={`${String(against)} ${String(ROUND)}`}
          strokeDashoffset={-lit}
        />
      ) : null}
      {tick === undefined ? null : (
        <line
          x1={50 + (R - 2.5) * Math.cos(tick)}
          y1={50 + (R - 2.5) * Math.sin(tick)}
          x2={50 + (R + 2.5) * Math.cos(tick)}
          y2={50 + (R + 2.5) * Math.sin(tick)}
          className={styles["mark"]}
        />
      )}
    </svg>
  );
}

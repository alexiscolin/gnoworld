import { Cluster } from "../compositions/index.ts";
import styles from "./Progress.module.css";

export interface ProgressProps {
  /** What it measures, read with its value by assistive technology ("Passport, DeFi"). */
  label: string;
  value: number;
  max: number;
  /** A bar that fills, a step a dot (a quest's steps, a constellation's worlds: 12 at most, past that a bar), or an arc of three quarters
   * of a ring that fills clockwise from its lower left (the search drawer's passport, frame 99). */
  kind?: "bar" | "steps" | "arc";
  /** The words beside it, as shown ("3/5"); none draws the gauge alone. */
  shown?: string;
}

const STEPS_MOST = 12;
// The arc: three quarters of a ring of radius 44 in a 100 by 100 drawing, measured as 100 along its path, turned to start at its lower left.
const ARC = 75;

function Arc({ done, max }: { done: number; max: number }) {
  const ring = { cx: 50, cy: 50, r: 44, pathLength: 100, transform: "rotate(135 50 50)" };
  return (
    <svg className={styles["arc"]} viewBox="0 0 100 100" aria-hidden="true">
      <circle className={styles["arcTrack"]} {...ring} strokeDasharray={`${String(ARC)} 100`} />
      {done === 0 ? null : (
        <circle className={styles["arcFill"]} {...ring} strokeDasharray={`${String((ARC * done) / max)} 100`} />
      )}
    </svg>
  );
}

/** How far something is: the passport's gauge, a quest's steps (docs/DESIGN-SYSTEM.md, "Progress"). Never a 0 out of 0: an empty
 * measure draws nothing. */
export function Progress({ label, value, max, kind = "bar", shown }: ProgressProps) {
  if (!(max > 0)) return null;
  const done = Math.min(Math.max(Math.floor(value), 0), max);
  const steps = kind === "steps" && max <= STEPS_MOST;
  return (
    <div
      role="progressbar"
      aria-label={label}
      aria-valuemin={0}
      aria-valuemax={max}
      aria-valuenow={done}
      aria-valuetext={`${String(done)} of ${String(max)}`}
    >
      <Cluster space="2xs">
        {kind === "arc" ? (
          <Arc done={done} max={max} />
        ) : steps ? (
          <span className={styles["steps"]} aria-hidden="true">
            {Array.from({ length: max }, (_, at) => (
              <span key={at} className={styles["step"]} data-done={at < done ? "" : undefined} />
            ))}
          </span>
        ) : (
          // An SVG's width is an attribute, which the page's CSP lets through where it refuses a style attribute.
          <svg className={styles["track"]} viewBox="0 0 100 4" preserveAspectRatio="none" aria-hidden="true">
            <rect className={styles["fill"]} width={(done / max) * 100} height={4} />
          </svg>
        )}
        {shown === undefined ? null : (
          <span className={styles["shown"]} aria-hidden="true">
            {shown}
          </span>
        )}
      </Cluster>
    </div>
  );
}

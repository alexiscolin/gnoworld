import { Cluster } from "../compositions/index.ts";
import styles from "./Progress.module.css";

export interface ProgressProps {
  /** What it measures, read with its value by assistive technology ("Passport, DeFi"). */
  label: string;
  value: number;
  max: number;
  /** A bar that fills, or a step a dot: a quest's steps, a constellation's worlds (12 at most; past that, a bar). */
  kind?: "bar" | "steps";
  /** The words beside it, as shown ("3/5"); none draws the gauge alone. */
  shown?: string;
}

const STEPS_MOST = 12;

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
        {steps ? (
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

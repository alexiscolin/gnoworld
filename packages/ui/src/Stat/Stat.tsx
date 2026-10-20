import { useEffect, useEffectEvent, useState, useSyncExternalStore } from "react";
import { Chip } from "../Chip/Chip.tsx";
import { Cluster, Stack } from "../compositions/index.ts";
import { grouped } from "../format.ts";
import styles from "./Stat.module.css";

export interface StatProps {
  value: number;
  unit?: string;
  caption: string;
  /** The change since yesterday; said in words, coral when it falls. */
  delta?: number;
  /** The heat badge. */
  hot?: boolean;
}

// The arrival's figures count up within its 1.2 s (docs/DESIGN-SYSTEM.md, "Motion").
const COUNT = 1_000;

const MOTION = "(prefers-reduced-motion: no-preference)";
const unwatched = () => () => undefined;

/** The figure as drawn: from nothing to its value on arrival, easing out, when motion is welcome; never
 * on the server, so the page it sends holds the value. A value that changes after shows at once. */
function useCounted(value: number) {
  const moving = useSyncExternalStore(
    unwatched,
    () => matchMedia(MOTION).matches,
    () => false,
  );
  // The count on its way, or null once it has arrived.
  const [counted, setCounted] = useState<number | null>(0);
  const target = useEffectEvent(() => value);
  useEffect(() => {
    if (!moving) return;
    // A frame's time can come just before the effect's: the count starts at nothing, never below.
    const start = performance.now();
    let frame = 0;
    const step = (now: number) => {
      const done = Math.min(1, Math.max(0, (now - start) / COUNT));
      setCounted(done < 1 ? Math.round(target() * (1 - (1 - done) ** 3)) : null);
      if (done < 1) frame = requestAnimationFrame(step);
    };
    frame = requestAnimationFrame(step);
    return () => {
      cancelAnimationFrame(frame);
    };
  }, [moving]);
  return !moving || counted === null ? value : counted;
}

function said(delta: number) {
  if (delta > 0) return { words: `${grouped(delta)} more than yesterday`, trend: "up" };
  if (delta < 0) return { words: `${grouped(-delta)} fewer than yesterday`, trend: "down" };
  return { words: "the same as yesterday", trend: "flat" };
}

/** A tabular figure with its unit and caption, its change in words, and the heat badge. Assistive
 * technology reads its value alone, never a count on its way. */
export function Stat({ value: given, unit, caption, delta, hot = false }: StatProps) {
  // A figure that is no number counts as none, as a chart's value does; a change that is none, unsaid.
  const value = Number.isFinite(given) ? given : 0;
  const shown = useCounted(value);
  const change = delta === undefined || !Number.isFinite(delta) ? null : said(delta);
  return (
    <Stack space="3xs">
      <p className={styles["figure"]}>
        <span data-value={value} aria-hidden="true">
          {grouped(shown)}
        </span>
        <span className="visually-hidden">{grouped(value)}</span>
        {unit === undefined ? null : <span className={styles["unit"]}> {unit}</span>}
      </p>
      <Cluster space="2xs">
        <p className="label">{caption}</p>
        {hot ? <Chip tone="warm">Hot</Chip> : null}
      </Cluster>
      {change === null ? null : (
        <p className={styles["delta"]} data-trend={change.trend}>
          {change.words}
        </p>
      )}
    </Stack>
  );
}

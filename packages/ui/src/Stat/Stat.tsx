import { useEffect, useState, useSyncExternalStore } from "react";
import { Chip } from "../Chip/Chip.tsx";
import { Cluster, Stack } from "../compositions/index.ts";
import { grouped } from "../format.ts";
import { Icon, type IconName } from "../icons/Icon.tsx";
import styles from "./Stat.module.css";

export interface StatProps {
  value: number;
  unit?: string;
  caption: string;
  /** The change since yesterday; said in words, coral when it falls. */
  delta?: number;
  /** The heat badge. */
  hot?: boolean;
  /** A line icon before the caption, in its colour: what the figure counts, seen at a glance. */
  icon?: IconName;
}

// The arrival's figures count up over 0.9 s, easing out as GSAP's power3.out (the dive's demo, D401), 0.25 s after the page's text
// starts entering: once the flight that brings it nears its end (`data-flown`, set by the app's globe box).
const COUNT = 900;
const AFTER = 250;
const FLYING = "[data-flown='flying']";

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
  // How far the count has come, from nothing to its value: 0 to 1.
  const [done, setDone] = useState(0);
  useEffect(() => {
    if (!moving) return;
    // A frame's time can come just before the effect's: the count starts at nothing, never below.
    let start = performance.now();
    let frame = 0;
    const step = (now: number) => {
      // The count waits out a flight: it starts as the page lands.
      if (document.querySelector(FLYING) !== null) start = now;
      const far = Math.min(1, Math.max(0, (now - start - AFTER) / COUNT));
      setDone(far);
      if (far < 1) frame = requestAnimationFrame(step);
    };
    frame = requestAnimationFrame(step);
    return () => {
      cancelAnimationFrame(frame);
    };
  }, [moving]);
  return moving && done < 1 ? Math.round(value * (1 - (1 - done) ** 4)) : value;
}

function said(delta: number) {
  if (delta > 0) return { words: `${grouped(delta)} more than yesterday`, trend: "up" };
  if (delta < 0) return { words: `${grouped(-delta)} fewer than yesterday`, trend: "down" };
  return { words: "the same as yesterday", trend: "flat" };
}

/** A tabular figure with its unit and caption, its change in words, and the heat badge. Assistive
 * technology reads its value alone, never a count on its way. */
export function Stat({ value: given, unit, caption, delta, hot = false, icon }: StatProps) {
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
        <p className={["label", styles["caption"]].join(" ")}>
          {icon === undefined ? null : <Icon name={icon} size="s" />}
          {caption}
        </p>
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

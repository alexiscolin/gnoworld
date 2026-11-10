import { Chip } from "../Chip/Chip.tsx";
import { Cluster, Stack } from "../compositions/index.ts";
import { grouped } from "../format.ts";
import { Icon, type IconName } from "../icons/Icon.tsx";
import styles from "./Stat.module.css";
import { useCounted } from "./useCounted.ts";

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

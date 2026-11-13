import type { CSSProperties } from "react";
import { Cluster, Grid, Stack } from "../compositions/index.ts";
import { zeroHeight, Sparkline } from "../Sparkline/Sparkline.tsx";
import { useCounted } from "../Stat/useCounted.ts";
import { grouped } from "../format.ts";
import card from "../Card/Card.module.css";
import styles from "./Figures.module.css";

/** One cell of the band: what it counts, its value, what it says under it. */
export interface Figure {
  key: string;
  /** What it counts, over the value. */
  label: string;
  /** A count, drawn counting up on arrival; or a word in its place (Never), dimmed. */
  value: number | string;
  /** Beside the count, small ("days ago"). */
  unit?: string | undefined;
  /** Under the value, in the meta type. */
  sub: string;
  /** Its last values, a small line beside the count with a mark at the last one: a count's days. */
  spark?: readonly number[] | undefined;
}

export interface FiguresProps {
  /** Names the band. */
  label: string;
  /** Four cells fill the plate's 12 columns, three each; two per row on a narrow plate. */
  figures: readonly Figure[];
}

// The count's arrival, the proposal's: 1.1 s after 0.7 s.
const COUNT = { count: 1100, after: 700 };

// The proposal's small line: 64 by 32 px, with a dot at its last value.
function Trace({ values }: { values: readonly number[] }) {
  const peak = Math.max(1, ...values);
  const last = values.at(-1) ?? 0;
  const top = `${String(zeroHeight(last / peak) * 100)}%`;
  return (
    <span className={styles["trace"]} aria-hidden="true">
      <Sparkline values={values} tone="flat" from="zero" fills arrives />
      <i className={["disc", styles["dot"]].join(" ")} style={{ top }} />
      <i className={["disc", styles["ring"]].join(" ")} style={{ top }} />
    </span>
  );
}

function Value({ value, unit }: Pick<Figure, "value" | "unit">) {
  const given = typeof value === "number" && Number.isFinite(value) ? value : 0;
  const shown = useCounted(given, COUNT);
  return typeof value === "string" ? (
    <span className={styles["value"]} data-dim="">
      {value}
    </span>
  ) : (
    <span className={styles["value"]}>
      <span aria-hidden="true">{grouped(shown)}</span>
      <span className="visually-hidden">{grouped(given)}</span>
      {unit === undefined ? null : <small>{unit}</small>}
    </span>
  );
}

/** The figures band: cells in one hub card, a line between two on the gutter; each cell a label, a value (counting up, a small line beside
 * it) and what it says. */
export function Figures({ label, figures }: FiguresProps) {
  return (
    <section
      aria-label={label}
      className={[card["card"], styles["band"]].join(" ")}
      data-look="hub"
      data-flush=""
      data-fixed=""
      data-tone="neutral"
      data-edge="solid"
    >
      <Grid cols={12} space="s">
        {figures.map(({ key, label: name, value, unit, sub, spark }, at) => (
          <div
            key={key}
            className={styles["cell"]}
            data-span="3"
            data-span-narrow="6"
            style={{ "--n": at } as CSSProperties}
          >
            <Stack space="2xs">
              <span className={styles["label"]}>{name}</span>
              <Cluster justify="between" align="end" wrap="no" space="2xs">
                <Value value={value} unit={unit} />
                {spark === undefined || spark.length < 2 ? null : <Trace values={spark} />}
              </Cluster>
              <span className="meta">{sub}</span>
            </Stack>
          </div>
        ))}
      </Grid>
    </section>
  );
}

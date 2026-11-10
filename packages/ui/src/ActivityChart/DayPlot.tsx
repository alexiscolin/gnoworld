import type { CSSProperties } from "react";
import { grouped } from "../format.ts";
import { BAR_MIN, LEFT, plotOf, tickWord } from "./dayPlot.ts";
import styles from "./DayChart.module.css";

const DOT = 1.4;

export interface DayPlotProps {
  counts: readonly number[];
  /** The word under each value, oldest first. */
  named: (at: number) => string;
  scale: "log" | "linear";
  now: string;
  w: number;
  h: number;
}

// The date under a slot: the first at the plot's edge, the last as the axis' "now", then one in every few, none too near the last.
function DateWord({
  at,
  last,
  every,
  x,
  h,
  now,
  word,
}: {
  at: number;
  last: number;
  every: number;
  x: number;
  h: number;
  now: string;
  word: string;
}) {
  if (at === last) {
    return (
      <text className={styles["tk"]} x={x} y={h - 4} textAnchor="end">
        {now}
      </text>
    );
  }
  if (at % every !== 0 || at + every * 0.6 >= last) return null;
  return (
    <text className={styles["tk"]} x={x} y={h - 4} textAnchor={at === 0 ? "start" : "middle"}>
      {word}
    </text>
  );
}

// The peak's words over its bar, kept inside the plot.
function Peak({
  peak,
  at,
  plot,
  named,
  w,
}: {
  peak: number;
  at: number;
  plot: ReturnType<typeof plotOf>;
  named: (at: number) => string;
  w: number;
}) {
  const x = plot.center(at);
  const side = x < LEFT + 70 ? "start" : x > w - 70 ? "end" : "middle";
  return (
    <text
      className={[styles["tk"], styles["peak"]].join(" ")}
      data-strong=""
      x={side === "start" ? LEFT + plot.slot * 0.2 : side === "end" ? w : x}
      y={plot.y(peak) - 6}
      textAnchor={side}
    >
      {`${grouped(peak)} · ${named(at)}`}
    </text>
  );
}

/** The drawing: the axis' lines and numbers, a bar for each day with a count (a dot for one with none), the dates, the peak's words. */
export function DayPlot({ counts, named, scale, now, w, h }: DayPlotProps) {
  const plot = plotOf({ counts, scale, w, h });
  const peak = Math.max(0, ...counts);
  const current = counts.findLastIndex((count) => count > 0);
  const last = counts.length - 1;
  return (
    <svg className={styles["chart"]} width={w} height={h} viewBox={`0 0 ${String(w)} ${String(h)}`} aria-hidden="true">
      {plot.ticks.map((tick) => (
        <g key={tick}>
          <line className={styles["gl"]} x1={LEFT} x2={w} y1={plot.y(tick)} y2={plot.y(tick)} />
          <text className={styles["tk"]} x={LEFT - 8} y={plot.y(tick) + 4} textAnchor="end">
            {tickWord(tick)}
          </text>
        </g>
      ))}
      {counts.map((count, at) => {
        const high = Math.max(BAR_MIN, plot.base - plot.y(count));
        return (
          <g key={named(at)}>
            {count === 0 ? (
              <circle className={styles["zero"]} data-hour={at} cx={plot.center(at)} cy={plot.base} r={DOT} />
            ) : (
              <rect
                className={styles["bar"]}
                data-hour={at}
                data-current={at === current ? "true" : undefined}
                style={{ "--j": at } as CSSProperties}
                x={plot.center(at) - plot.bar / 2}
                y={plot.base - high}
                width={plot.bar}
                height={high}
                rx={Math.min(4, plot.bar / 2)}
              />
            )}
            <DateWord
              at={at}
              last={last}
              every={plot.every}
              x={at === last ? w : at === 0 ? LEFT + at * plot.slot : plot.center(at)}
              h={h}
              now={now}
              word={named(at)}
            />
          </g>
        );
      })}
      {peak === 0 ? null : <Peak peak={peak} at={counts.indexOf(peak)} plot={plot} named={named} w={w} />}
    </svg>
  );
}

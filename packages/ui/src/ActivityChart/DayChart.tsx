import { useLayoutEffect, useRef, useState, type CSSProperties, type RefObject } from "react";
import { Stack } from "../compositions/index.ts";
import { grouped } from "../format.ts";
import { Tip, when } from "./ActivityChart.tsx";
import { DayPlot } from "./DayPlot.tsx";
import { useReading } from "./useReading.ts";
import styles from "./DayChart.module.css";

/** The most bars it draws: the last ones of a longer series. */
const DAYS_MAX = 400;

export interface DayChartProps {
  /** What the values count: the group's and the table's name. */
  label: string;
  /** Oldest first, the last one now; a negative or missing value counts as none. */
  values: readonly number[];
  /** Log lets a quiet day show beside a busy one; linear is to scale. */
  scale?: "log" | "linear";
  /** One word for each value (a date), oldest first, in the tooltip, the axis and the table; "N days ago" where missing. */
  labels?: readonly string[];
  /** How many distinct callers each value had, for the tooltip. */
  callers?: readonly number[];
  /** What a value counts, singular and plural, for the tooltip ("call", "calls"). */
  noun?: readonly [string, string];
  /** The axis' last word, where the last value is now: "today" for days. */
  now?: string;
  /** Added to a value's word in the tooltip (" UTC" after an hour). */
  suffix?: string;
}

const NOUN = ["call", "calls"] as const;
const said = (count: number, noun: readonly [string, string]) =>
  count === 0 ? `no ${noun[0]}` : `${grouped(count)} ${count === 1 ? noun[0] : noun[1]}`;
const callersSaid = (callers: number | undefined) =>
  callers === undefined || callers === 0 ? "" : ` · ${String(callers)} caller${callers === 1 ? "" : "s"}`;

// The tooltip over the bar the pointer or the keyboard rests on, and what a screen reader hears of the focused one.
function Reading({
  points,
  reading,
  plot,
  say,
}: {
  points: { count: number; at: number; high: number }[];
  reading: ReturnType<typeof useReading>;
  plot: RefObject<HTMLDivElement | null>;
  /** What a value says: its date, then its count and callers, as the tooltip words them. */
  say: (at: number, count: number) => { date: string; counts: string };
}) {
  const shown = points[reading.shown ?? -1];
  const focused = points[reading.focusAt ?? -1];
  const tip = shown === undefined ? undefined : say(shown.at, shown.count);
  return (
    <>
      {shown === undefined || tip === undefined ? null : (
        <Tip
          point={shown}
          last={points.length - 1}
          unit="day"
          plot={plot}
          pill
          words={
            <>
              <b>{tip.date}</b>
              {` · ${tip.counts}`}
            </>
          }
        />
      )}
      <span role="status" className="visually-hidden">
        {focused === undefined ? null : `${say(focused.at, focused.count).date}, ${grouped(focused.count)}`}
      </span>
    </>
  );
}

// Every value, for assistive technology; a table is never narrower than its words: the box around it clips it.
function Table({ label, rows }: { label: string; rows: (readonly [string, number])[] }) {
  return (
    <div className="visually-hidden">
      <table>
        <caption>{label}</caption>
        <thead>
          <tr>
            <th scope="col">When</th>
            <th scope="col">Count</th>
          </tr>
        </thead>
        <tbody>
          {rows.map(([when, count]) => (
            <tr key={when}>
              <th scope="row">{when}</th>
              <td>{grouped(count)}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

// The plot's box, measured: the drawing is in pixels, so the bars keep their widths whatever the plate's.
function useBox() {
  const ref = useRef<HTMLDivElement>(null);
  const [box, setBox] = useState<{ w: number; h: number }>();
  useLayoutEffect(() => {
    const node = ref.current;
    if (node === null) return;
    const read = () => {
      setBox((now) =>
        now?.w === node.clientWidth && now.h === node.clientHeight
          ? now
          : { w: node.clientWidth, h: node.clientHeight },
      );
    };
    read();
    const watch = new ResizeObserver(read);
    watch.observe(node);
    return () => {
      watch.disconnect();
    };
  }, []);
  return { ref, box };
}

/** Calls per day, as many as 400: bars on a log or a linear scale, an axis at its steps, the dates under it, the peak written over its bar, a day with
 * none a small dot, the latest bar in the text colour; the tooltip and the keyboard of ActivityChart, and every value in a table for assistive
 * technology. The bars grow, the axis fades in, as the plate's arrival plays (the proposal's score, through the card's --d). */
export function DayChart({
  label,
  values,
  scale = "log",
  labels,
  callers,
  noun = NOUN,
  now = "today",
  suffix = "",
}: DayChartProps) {
  const from = Math.max(0, values.length - DAYS_MAX);
  const counts = values.slice(from).map((value) => (Number.isFinite(value) && value > 0 ? value : 0));
  const named = (at: number) => labels?.[from + at] ?? when(counts.length - 1 - at, "day");
  const { ref, box } = useBox();
  const points = counts.map((count, at) => ({ count, at, high: count }));
  const reading = useReading(points.length);
  const plotRef = useRef<HTMLDivElement>(null);
  const group = points.length > 0 ? { role: "group", "aria-label": label, tabIndex: 0, ...reading.group } : {};
  return (
    <Stack space="2xs">
      <div
        ref={plotRef}
        className={styles["plot"]}
        style={{ "--pk": `${(0.13 + counts.length * 0.012 + 0.55).toFixed(2)}s` } as CSSProperties}
        {...group}
      >
        <div ref={ref} className={styles["box"]}>
          {box === undefined || counts.length === 0 ? null : (
            <DayPlot key={scale} counts={counts} named={named} scale={scale} now={now} w={box.w} h={box.h} />
          )}
          {/* The pointer reads the slot it is in, across the plot's own width (the axis' numbers are not a slot). */}
          <div className={styles["hits"]} {...reading.plot} />
        </div>
        <Reading
          points={points}
          reading={reading}
          plot={plotRef}
          say={(at, count) => ({
            date: `${named(at)}${suffix}`,
            counts: `${said(count, noun)}${callersSaid(callers?.[from + at])}`,
          })}
        />
      </div>
      <Table label={label} rows={points.map(({ count, at }) => [named(at), count])} />
    </Stack>
  );
}

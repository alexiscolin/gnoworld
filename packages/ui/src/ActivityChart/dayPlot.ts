// The day chart's drawing in numbers (the proposal's drawChart): where the axis' steps, the bars and the dates stand in a box of pixels.

/** The plot's margins: the axis' numbers 36 px at the left, 16 px over the peak, the dates 24 px under the foot. */
export const LEFT = 36;
const TOP = 16;
const FOOT = 24;
const BAR_MAX = 18;
export const BAR_MIN = 3;
const BAR_SHARE = 0.62;
const DATES = 6;

// The nicest steps a linear axis has: about three of them to the peak, each 1, 2, 5 or 10 of a power of ten.
function niceTicks(peak: number) {
  let step = 10 ** Math.floor(Math.log10(peak / 3 || 1));
  const lead = peak / 3 / step;
  step *= lead > 5 ? 10 : lead > 2 ? 5 : lead > 1 ? 2 : 1;
  const ticks: number[] = [];
  for (let v = 0; v <= peak + step * 0.001; v += step) ticks.push(v);
  const top = ticks.at(-1) ?? 0;
  return top < peak ? [...ticks, top + step] : ticks;
}

// A log axis: 0, then each power of ten up to the first that holds the peak (10 at least).
function logTicks(peak: number) {
  const ticks = [0];
  for (let v = 1; v <= Math.max(peak, 10); v *= 10) ticks.push(v);
  const top = ticks.at(-1) ?? 1;
  return top < peak ? [...ticks, top * 10] : ticks;
}

export const tickWord = (n: number) => (n >= 1000 ? `${String(n / 1000)}k` : String(n));

export interface Plot {
  /** The axis' steps, from nothing up. */
  ticks: number[];
  /** A count's height in the box, in pixels from its top. */
  y: (count: number) => number;
  /** The baseline, and a slot's width. */
  base: number;
  slot: number;
  /** A bar's width. */
  bar: number;
  /** The dates' every: one slot in this many has its date under it. */
  every: number;
  /** Where the middle of slot `at` stands. */
  center: (at: number) => number;
}

/** The plot of `counts` in a box `w` by `h`, on a log or a linear axis. */
export function plotOf({
  counts,
  scale,
  w,
  h,
}: {
  counts: readonly number[];
  scale: "log" | "linear";
  w: number;
  h: number;
}): Plot {
  const peak = Math.max(0, ...counts);
  const log = scale === "log";
  const ticks = peak === 0 ? [0] : log ? logTicks(peak) : niceTicks(Math.max(peak, 3));
  const highest = ticks.at(-1) ?? 1;
  const top = peak === 0 ? 1 : log ? Math.log10(1 + highest) : highest;
  const plotH = h - TOP - FOOT;
  const slot = (w - LEFT) / Math.max(1, counts.length);
  return {
    ticks,
    y: (count) => TOP + plotH * (1 - (log ? Math.log10(1 + count) : count) / top),
    base: TOP + plotH,
    slot,
    bar: Math.max(BAR_MIN, Math.min(slot * BAR_SHARE, BAR_MAX)),
    every: Math.max(1, Math.ceil(counts.length / DATES)),
    center: (at) => LEFT + at * slot + slot / 2,
  };
}

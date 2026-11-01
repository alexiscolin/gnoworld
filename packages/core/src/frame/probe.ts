// Auto (ADR-0002 §9, rendering): it times the first 2 s or 90 busy frames. Above 20 ms a frame on average, the slowest tenth ignored,
// the device drops to Low and remembers it; a steady 33 ms reads as the browser's battery saver, and is not remembered.

export const PROBE_FRAMES = 90;
const PROBE_MS = 2000;
// Under ten frames the slowest tenth is none: one stall would be the verdict, and remembered for good.
const FEWEST_FRAMES = 10;
const LOW_ABOVE_MS = 20;
const SAVER_MS = 33.3;
const SAVER_WITHIN_MS = 3;

export type ProbeVerdict = "pending" | "keep" | "low" | "low-for-now";

/** The verdict on the first `count` frame times of `frames`. Pending allocates nothing: the loop asks at every busy frame. */
export function judgeFrames(frames: ArrayLike<number>, count: number): ProbeVerdict {
  let spent = 0;
  for (let at = 0; at < count; at += 1) spent += frames[at] ?? 0;
  if (count < FEWEST_FRAMES || (count < PROBE_FRAMES && spent < PROBE_MS)) return "pending";
  const kept = Array.from({ length: count }, (_, at) => frames[at] ?? 0)
    .sort((a, b) => a - b)
    .slice(0, count - Math.floor(count / 10));
  const mean = kept.reduce((sum, frame) => sum + frame, 0) / kept.length;
  if (mean <= LOW_ABOVE_MS) return "keep";
  return kept.every((frame) => Math.abs(frame - SAVER_MS) <= SAVER_WITHIN_MS) ? "low-for-now" : "low";
}

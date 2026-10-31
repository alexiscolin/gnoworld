// A world's activity (frame 26): "ACTIVITY · LAST 24 H" above the bars and "24 H AGO" under them. The peak and the rate now are the
// chart's own row, "Peak" and "Now", written once (F2867). With no history, the words say so, and no chart is drawn: a chart of
// nothing would read as a quiet world.
import { Stack } from "@gnoworld/ui";
import { lazy, Suspense } from "react";

// The bars come in their own chunk, once a world has a history: the first screen of a page with none does not pay for them.
const Bars = lazy(() => import("./Bars.tsx"));

// The chart counts a missing, negative or non-finite value as none; so does this block.
const counted = (value: number) => (Number.isFinite(value) && value > 0 ? Math.round(value) : 0);

export function Activity({ hours }: { hours?: number[] | undefined }) {
  if (hours === undefined || hours.length === 0) {
    return <p className="label">No activity recorded yet</p>;
  }
  const counts = hours.map(counted);
  return (
    <Stack space="2xs">
      <p className="label">Activity · last 24 h</p>
      <Suspense fallback={<p className="label">Loading the chart</p>}>
        <Bars values={counts} />
      </Suspense>
      <p className="label">{counts.length} h ago</p>
    </Stack>
  );
}

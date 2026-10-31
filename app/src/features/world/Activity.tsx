// A world's activity (frame 26): "ACTIVITY · LAST 24 H" and the rate now above the bars, "24 H AGO", the peak and "NOW" under
// them. With no history, the words say so, and no chart is drawn: a chart of nothing would read as a quiet world.
import { Cluster, Stack } from "@gnoworld/ui";
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
  const peak = Math.max(...counts);
  const now = counts.at(-1) ?? 0;
  return (
    <Stack space="2xs">
      <Cluster space="s" justify="between">
        <p className="label">Activity · last 24 h</p>
        <p className="label">{now} msgs/h now</p>
      </Cluster>
      <Suspense fallback={<p className="label">Loading the chart</p>}>
        <Bars values={counts} />
      </Suspense>
      <Cluster space="s" justify="between">
        <p className="label">{counts.length} h ago</p>
        <p className="label">peak {peak}/h</p>
        <p className="label">now</p>
      </Cluster>
    </Stack>
  );
}

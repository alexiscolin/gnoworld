import { ActivityChart } from "../ActivityChart/ActivityChart.tsx";
import { Cluster, Stack } from "../compositions/index.ts";
import { Sparkline } from "../Sparkline/Sparkline.tsx";
import { DAY } from "./samples.ts";

export function Activity() {
  return (
    <Stack space="s">
      <ActivityChart label="Calls per hour, today" values={DAY} />
      <Cluster space="m">
        <Sparkline values={DAY} tone="up" />
        <Sparkline values={DAY.toReversed()} tone="down" />
      </Cluster>
    </Stack>
  );
}

// The activity's bars: the design system's chart with its tooltip, loaded apart (Activity.tsx), which writes the peak and now itself.
import { ActivityChart } from "@gnoworld/ui";

export default function Bars({ values, none }: { values: number[]; none: boolean }) {
  return (
    <ActivityChart
      label={none ? "No activity recorded yet" : `Messages per hour, the last ${String(values.length)} hours`}
      values={values}
      figures={false}
    />
  );
}

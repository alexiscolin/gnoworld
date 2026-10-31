// The activity's bars: the design system's chart with its tooltip, loaded apart (Activity.tsx).
import { ActivityChart } from "@gnoworld/ui";

export default function Bars({ values }: { values: number[] }) {
  return <ActivityChart label={`Messages per hour, the last ${String(values.length)} hours`} values={values} />;
}

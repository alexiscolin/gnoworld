// The Earth's realms deployed in the last 24 hours, by block time, with the block the count stood at: a figure as the world's facts are
// (frame 38). With no count from the server it draws nothing: a zero made up would read as a quiet chain.
import type { RealmsDeployed } from "@gnoworld/schemas";
import { Stat } from "@gnoworld/ui";

export function RealmsToday({ count }: { count: RealmsDeployed | undefined }) {
  if (count === undefined) return null;
  return (
    <Stat
      value={count.count}
      unit={count.count === 1 ? "realm" : "realms"}
      caption={`deployed in 24 h · block ${String(count.height)}`}
    />
  );
}

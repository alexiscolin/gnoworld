// The Earth's realms deployed in the last 24 hours, by block time, with the block the count stood at. With no count from the server it draws
// nothing: a zero made up would read as a quiet chain.
import type { RealmsDeployed } from "@gnoworld/schemas";

export function RealmsToday({ count }: { count: RealmsDeployed | undefined }) {
  if (count === undefined) return null;
  return (
    <p className="label">
      {count.count} {count.count === 1 ? "realm" : "realms"} deployed in the last 24 h · block {count.height}
    </p>
  );
}

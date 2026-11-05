// The plate's "First charted by @name" (frame 91), loaded by Arrival.tsx once the stream has told a signal: a chunk of its own,
// as small as it can be, since a guest's page on any charted world asks for it at once (budgets.spec.ts).
import type { Signal } from "@gnoworld/schemas";
import { useApp } from "../../storeContext.tsx";
import { shortAddress } from "../chat/index.ts";

/** The world's first of a kind, as the stream told it. */
export const useFirst = (world: string, kind: Signal["kind"]) =>
  useApp(({ signals }) => signals.find((signal) => signal.world === world && signal.kind === kind));

/** Plain text of the short address until slice 9f's names (D212). */
export function ChartedBy({ world }: { world: string }) {
  const charted = useFirst(world, "chart");
  return charted === undefined ? null : <span>First charted by @{shortAddress(charted.account)}</span>;
}

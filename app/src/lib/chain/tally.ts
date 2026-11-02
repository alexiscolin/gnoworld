// The words of a proposal's tally, apart from proposal.ts (the page's reader, its patterns and the schema's code): a world's
// first screen draws the pill, and its budget has no room for the reader (F2975).
import type { Proposal } from "@gnoworld/schemas/proposal";

/** The words of a proposal's tally, `YES 33% of 66.66%`: the yes to a whole percent, the threshold to two decimals with no
 * trailing zero; where the realm states no threshold, an open proposal's `YES 33% · NO 0%` (F4308); none unless the page gave a pair.
 * The pill and the card say the same words from here. */
export function tallyOf(proposal: Pick<Proposal, "yes" | "no" | "threshold">): string | undefined {
  const { yes, no, threshold } = proposal;
  if (yes === undefined) return undefined;
  if (threshold !== undefined) return `YES ${String(Math.round(yes))}% of ${String(Number(threshold.toFixed(2)))}%`;
  return no === undefined ? undefined : `YES ${String(Math.round(yes))}% · NO ${String(Math.round(no))}%`;
}

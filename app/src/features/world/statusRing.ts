// The data the status ring will draw (5k; the orbit is slice 7): the lit share of the ring and the mark of the threshold, each a
// fraction of the orbit. The ring shows only what a realm reports: no tally, no ring (gnoworld invents no timer).
import { isShare, type Proposal } from "../../lib/chain/proposal.ts";

export interface Ring {
  /** The yes share, 0 to 1. */
  readonly lit: number;
  /** Where the threshold sits, 0 to 1. */
  readonly mark: number;
}

export function ringOf({ yes, threshold }: Pick<Proposal, "id" | "yes" | "threshold">): Ring | undefined {
  return isShare(yes) && isShare(threshold) ? { lit: yes / 100, mark: threshold / 100 } : undefined;
}

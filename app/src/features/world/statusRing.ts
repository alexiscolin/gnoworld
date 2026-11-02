// The data the status ring will draw (5k; the orbit is slice 7): the lit share of the ring and the mark of the threshold, each a
// fraction of the orbit. The ring shows only what a realm reports: no tally, no ring (gnoworld invents no timer).
import type { Proposal } from "../../lib/chain/proposal.ts";

export interface Ring {
  /** The yes share, 0 to 1. */
  readonly lit: number;
  /** The no share, 0 to 1, when an open proposal's page states it (F4308). */
  readonly against?: number;
  /** Where the threshold sits, 0 to 1, when the realm states one: none is drawn where none exists. */
  readonly mark?: number;
}

export function ringOf({ yes, no, threshold }: Pick<Proposal, "id" | "yes" | "no" | "threshold">): Ring | undefined {
  if (yes === undefined || (no === undefined && threshold === undefined)) return undefined;
  return {
    lit: yes / 100,
    ...(no === undefined ? {} : { against: no / 100 }),
    ...(threshold === undefined ? {} : { mark: threshold / 100 }),
  };
}

// A GovDAO proposal as the browser holds it (slice 5 part 2, 5k): what `proposalOf` builds from a realm's page, and what every
// view then trusts. The realm's page is text a proposer wrote, so each field is bounded here, in code units, whatever it held:
// a whole non-negative number, a title and a state of bounded length, a share only from 0 to 100.
import { z } from "./zod.ts";

/** The most code units of a title and of a state. */
export const PROPOSAL_CAPS = { title: 200, state: 40 } as const;

const share = z.number().check(z.gte(0), z.lte(100));

export const Proposal = z.object({
  // Not z.int(): see indexer.ts (F2976).
  id: z.number().check(z.refine(Number.isSafeInteger, { message: "a whole number" }), z.nonnegative()),
  title: z.string().check(z.minLength(1), z.maxLength(PROPOSAL_CAPS.title)),
  /** The realm's word for the state; empty when the page named none or named two. */
  state: z.string().check(z.maxLength(PROPOSAL_CAPS.state)),
  /** The share of yes votes, 0 to 100, when the page said it. */
  yes: z.optional(share),
  /** The share of no votes, 0 to 100, when an open proposal's page said it. */
  no: z.optional(share),
  /** The share of yes the proposal needs, 0 to 100, when the page said it. */
  threshold: z.optional(share),
});
export type Proposal = z.infer<typeof Proposal>;

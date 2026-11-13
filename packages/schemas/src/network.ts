// GET /api/network: one line of the universe's health, which the worlds job computes once a pass from the indexer's transactions and the
// server serves from memory: the transactions and the accounts that sent them each UTC day, the last 14, and the chain's tip. Only whole
// numbers and times reach a page; the addresses are counted at the job and dropped.
import { Day } from "./day.ts";
import { Slug, Moment } from "./worldsHead.ts";
import { ChainCount } from "./realmPath.ts";
import { z } from "./zod.ts";

/** The days the line draws, and the most bytes of an answer (14 days at their caps are under 1 KB). */
export const NETWORK_DAYS = 14;
export const NETWORK_MAX_BYTES = 4096;
/** The most a day's count may say: a chain a thousand times onyx's busiest day. */
const NETWORK_COUNT_MAX = 1e9;

const Counted = ChainCount.check(z.lte(NETWORK_COUNT_MAX));

export const NetworkAnswer = z.strictObject({
  version: z.literal(1),
  universe: Slug,
  updated: Moment,
  /** The chain's last block the pass saw. */
  tip: z.strictObject({ height: ChainCount, time: Moment }),
  /** Oldest first, today's last; a day the pass read and found empty is a zero. */
  days: z.array(z.strictObject({ day: Day, txs: Counted, accounts: Counted })).check(
    z.maxLength(NETWORK_DAYS),
    z.refine((days) => days.every(({ day }, at) => at === 0 || (days[at - 1]?.day ?? "") < day), {
      message: "days oldest first, each once",
    }),
  ),
});
export type NetworkAnswer = z.infer<typeof NetworkAnswer>;

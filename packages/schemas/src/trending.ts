// GET /api/trending: the universe's most called worlds of the last 7 UTC days, which the worlds job computes once a pass
// from each realm's days and the server serves from memory; the chat's /trending card reads it. Every field came from a chain or an indexer.
import { ChainCount, DeployerAddress, RealmPath, WorldId } from "./worlds.ts";
import { Moment, WORLDS_CAPS } from "./worldsHead.ts";
import { z } from "./zod.ts";

/** The days the ranking spans, and the worlds it lists. */
export const TRENDING_DAYS = 7;
export const TRENDING_MOST = 5;
/** The most bytes of an answer: five items at their caps are under 2 KB. */
export const TRENDING_MAX_BYTES = 4096;

export const Trending = z.strictObject({
  updated: Moment,
  /** The worlds called in the span. */
  called: ChainCount,
  /** Ranked by people a day (the sum of each day's distinct callers), ties by calls. */
  items: z
    .array(
      z.strictObject({
        world: WorldId,
        title: z.string().check(z.minLength(1), z.maxLength(WORLDS_CAPS.name)),
        /** The world's first realm: where a tap flies. */
        realm: RealmPath,
        owner: z.nullable(DeployerAddress),
        calls: ChainCount,
        people: ChainCount,
      }),
    )
    .check(z.maxLength(TRENDING_MOST)),
});
export type Trending = z.infer<typeof Trending>;

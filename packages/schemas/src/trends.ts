// GET /api/trends (slice 7, 7t, 7t3): the home's ticker's trends, which the server computes from the worlds job's passes and who is here, so a
// phone reads a few items and never the worlds' file. Each kind once: the world Trending against its own 14 days, said by its strongest signal,
// the hub rising most against its own 14 days, the world the chain's list first showed in the last day. Every field came from a chain, an
// indexer or a room count, so each is bounded.
import { PER_HOUR_MOST } from "./counts.ts";
import { HubSlug } from "./slug.ts";
import { ChainCount, RealmPath, WorldId } from "./realmPath.ts";
import { Moment, WORLDS_CAPS } from "./worldsHead.ts";
import { z } from "./zod.ts";

/** The most items an answer holds: one of each kind. */
export const TRENDS_MOST = 3;
/** The most bytes of an answer: three items at their caps are under 2 KB. */
export const TRENDS_MAX_BYTES = 4096;

const Title = z.string().check(z.minLength(1), z.maxLength(WORLDS_CAPS.name));
// How far a Trending world's strongest signal stands above its own usual, as a share of it: never a fall, never past a chain's count.
const Rise = z.number().check(z.gt(0), z.lte(1e12));

// Trending by its chain (7t3): the transactions to its realms in the job's window, or the different addresses that sent them.
const ByChain = z.strictObject({
  kind: z.literal("trending"),
  by: z.enum(["transactions", "addresses"]),
  world: WorldId,
  realm: RealmPath,
  title: Title,
  count: ChainCount.check(z.gte(1)),
  rise: Rise,
  since: Moment,
  at: Moment,
});
// Trending by its rooms, a hub by its slug: its people here, or its messages an hour.
const ByChat = z.strictObject({
  kind: z.literal("trending"),
  by: z.enum(["here", "messages"]),
  world: HubSlug,
  count: z.number().check(z.gt(0), z.lte(PER_HOUR_MOST)),
  rise: Rise,
  at: Moment,
});
const Rising = z.strictObject({
  kind: z.literal("rising"),
  world: HubSlug,
  rise: z.number().check(z.gt(0), z.lte(1_000_000)),
  at: Moment,
});
const New = z.strictObject({ kind: z.literal("new"), world: WorldId, realm: RealmPath, title: Title, at: Moment });

/** One trend, as the server sends it. */
export const Trend = z.union([ByChain, ByChat, Rising, New]);
export type Trend = z.infer<typeof Trend>;

export const Trends = z.strictObject({
  items: z.array(Trend).check(
    z.maxLength(TRENDS_MOST),
    z.refine((items) => new Set(items.map(({ kind }) => kind)).size === items.length, { message: "each kind once" }),
  ),
});
export type Trends = z.infer<typeof Trends>;

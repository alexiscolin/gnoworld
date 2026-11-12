// A token world's holders and supply (slice 13): what the server replays from grc20's own events and serves at GET /api/tokens/<hash of the
// realm's path>. The events are the indexer's, written by whoever deployed a realm: each is checked here, one at a time, so a hostile one
// costs itself alone. Amounts are decimal text (an int64 on the chain, past a JS number); a fact not read is absent, never a zero.
import { Day } from "./day.ts";
import { stripHidden } from "./hidden.ts";
import { ChainCount, DeployerAddress, RealmPath } from "./worlds.ts";
import { z } from "./zod.ts";

/** The package whose events are the only ones believed: its `NewToken` binds a token's id to the realm that calls it. */
export const TOKEN_PACKAGE = "gno.land/p/nt/grc20/v0";

/** The most of each: holders and days in an answer, tokens in one, tokens a realm shows, tokens kept, and balance rows kept for one token. */
export const TOKEN_CAPS = { holders: 20, days: 30, perRealm: 3, tokens: 10_000, balances: 100_000, name: 64 } as const;
/** The most bytes of an answer: three tokens of twenty holders at their caps. */
export const TOKEN_MAX_BYTES = 16 * 1024;

/** The largest amount the chain holds in one balance or one transfer. */
export const INT64_MAX = 9_223_372_036_854_775_807n;

const ID = /^(.{1,260})\.([A-Za-z0-9_-]{1,32})\.([0-9a-z]{1,16})$/;

/** A token's id, `<realm path>.<symbol>.<id>`: the realm and the symbol, or nothing for a text that is no id. The realm may hold dots only
 * through its own check, so the last two dots split it. */
export function tokenIdOf(id: string): { realm: string; symbol: string } | undefined {
  const [, realm, symbol] = ID.exec(id) ?? [];
  return realm !== undefined && symbol !== undefined && RealmPath.safeParse(realm).success
    ? { realm, symbol }
    : undefined;
}

// Decimal digits and nothing else, up to 19 (an int64 has 19), and not above int64's maximum.
const Value = z.string().check(
  z.regex(/^\d{1,19}$/),
  z.refine((text) => BigInt(text) <= INT64_MAX, { message: "at most an int64" }),
);
const Side = z.union([z.literal(""), DeployerAddress]);

/** A `Transfer` event's attributes: a mint has no `from`, a burn no `to`. */
export const TransferAttrs = z.object({ token: z.string(), from: Side, to: Side, value: Value });
/** A `NewToken` event's attributes, the name stripped of control and format characters and cut. */
export const NewTokenAttrs = z.object({
  token: z.string(),
  name: z.pipe(
    z.string(),
    z.transform((name) => stripHidden(name).slice(0, TOKEN_CAPS.name)),
  ),
  symbol: z.string().check(z.regex(/^[A-Za-z0-9_-]{1,32}$/)),
  decimals: z.pipe(z.pipe(z.string().check(z.regex(/^\d{1,2}$/)), z.transform(Number)), z.number().check(z.lte(18))),
});

/** The indexer's answer to a read of grc20's events: each transaction's block and its events, each event left to `eventOf`. */
export const TokenEventsPage = z.object({
  data: z.object({
    getTransactions: z.nullable(
      z.array(z.object({ block_height: ChainCount, response: z.object({ events: z.nullable(z.array(z.unknown())) }) })),
    ),
  }),
  errors: z.optional(z.never()),
});

const Attr = z.object({
  key: z.string().check(z.maxLength(32)),
  value: z.string().check(z.maxLength(512)),
});
/** One event as the indexer gives it; a kind the indexer does not know is an empty object. */
export const EventRow = z.object({
  type: z.optional(z.string().check(z.maxLength(64))),
  pkg_path: z.optional(z.string().check(z.maxLength(256))),
  attrs: z.optional(z.array(Attr).check(z.maxLength(32))),
});

/** The answer for a realm: each token it holds (at most three), its holders by balance, its transfers a day, and the last transfer. A
 * token whose events were not believable has `ambiguous` and shows none of the rest. */
export const TokenAnswer = z.strictObject({
  /** The height the replay reaches. */
  height: ChainCount,
  tokens: z
    .array(
      z.strictObject({
        symbol: z.string().check(z.regex(/^[A-Za-z0-9_-]{1,32}$/)),
        name: z.string().check(z.maxLength(TOKEN_CAPS.name)),
        decimals: z.number().check(z.gte(0), z.lte(18)),
        ambiguous: z.boolean(),
        supply: z.nullable(z.string().check(z.regex(/^\d{1,25}$/))),
        holders: z.nullable(ChainCount),
        top: z
          .array(z.strictObject({ address: DeployerAddress, amount: z.string().check(z.regex(/^\d{1,19}$/)) }))
          .check(z.maxLength(TOKEN_CAPS.holders)),
        days: z.array(z.strictObject({ day: Day, transfers: ChainCount })).check(z.maxLength(TOKEN_CAPS.days)),
        last: z.nullable(z.strictObject({ day: Day, height: ChainCount })),
      }),
    )
    .check(z.maxLength(TOKEN_CAPS.perRealm)),
});
export type TokenAnswer = z.infer<typeof TokenAnswer>;

// GET /api/people/<address>: what the server knows of a person beyond their face, for the chat's person card. The calls are the rollup's
// (calls to the worlds' realms alone), their system the worlds they deployed, the balance one cached node read. Every field came from a chain
// or an indexer, so each is checked and every list capped; a block with nothing is null or empty, never made up.
import { Day } from "./day.ts";
import { ChainCount, RealmPath, WorldId } from "./realmPath.ts";
import { ExportedName } from "./worlds.ts";
import { Moment, WORLDS_CAPS } from "./worldsHead.ts";
import { z } from "./zod.ts";

/** The most entries of each list: calls a day kept, latest calls, worlds of their system, tokens they hold. */
export const PERSON_CAPS = { days: 30, latest: 8, system: 5, tokens: 5 } as const;
/** The most bytes of an answer: every list at its cap is under 3 KB. */
export const PERSON_MAX_BYTES = 6144;

/** An amount of the chain's coin in its smallest unit: an int64 at most, as text (a JS number is exact to 2^53 alone). */
export const Ugnot = z.string().check(
  z.regex(/^\d{1,19}$/),
  z.refine((text) => BigInt(text) <= 9_223_372_036_854_775_807n),
);

export const PersonCardData = z.strictObject({
  /** `ok` with its amount, `none` for an address the chain holds no account of, `unavailable` when the node was not asked or did not answer. */
  balance: z.union([
    z.strictObject({ state: z.literal("ok"), ugnot: Ugnot }),
    z.strictObject({ state: z.literal("none") }),
    z.strictObject({ state: z.literal("unavailable") }),
  ]),
  /** The worlds whose realms they deployed, the first five, and how many more. */
  system: z.strictObject({
    worlds: z
      .array(
        z.strictObject({
          world: WorldId,
          title: z.string().check(z.minLength(1), z.maxLength(WORLDS_CAPS.name)),
          realm: RealmPath,
        }),
      )
      .check(z.maxLength(PERSON_CAPS.system)),
    more: ChainCount,
  }),
  /** Their calls to the worlds' realms: none when there are none. */
  calls: z.nullable(
    z.strictObject({
      total: ChainCount,
      realms: ChainCount,
      /** The newest days with a call, newest last. */
      days: z.array(z.strictObject({ day: Day, calls: ChainCount })).check(z.maxLength(PERSON_CAPS.days)),
    }),
  ),
  /** Their newest calls, newest first. */
  latest: z
    .array(
      z.strictObject({
        realm: RealmPath,
        func: z.nullable(ExportedName),
        success: z.boolean(),
        time: z.nullable(Moment),
      }),
    )
    .check(z.maxLength(PERSON_CAPS.latest)),
  /** The tokens they hold most of, by amount in the token's own unit. */
  tokens: z
    .array(
      z.strictObject({
        realm: RealmPath,
        symbol: z.string().check(z.regex(/^[A-Za-z0-9_-]{1,32}$/)),
        decimals: z.number().check(z.int(), z.gte(0), z.lte(18)),
        amount: Ugnot,
      }),
    )
    .check(z.maxLength(PERSON_CAPS.tokens)),
});
export type PersonCardData = z.infer<typeof PersonCardData>;

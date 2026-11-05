// What the browser reads from the public indexer for a realm's facts (slice 5 part 2, 5k), and, for the realm view's call card (9d), a function's
// fees and a node's `tx`: no first-screen module reads them, so they sit here and not in the root's chain.ts. THE SHAPE IS OURS, NOT RECORDED: no
// indexer answer has been read through gnomcp yet (ledger F2950), so this is the shape the reader asks for and refuses anything
// else by; the day a recording differs, this file and its test are what change. The indexer has no time field (F2950), so no fact
// here may be a count by date (the calls in 24 h wait on an indexer with dates, F2974). Every text is capped, every count is a whole number: what an account
// or a realm wrote reaches the page as bounded text or not at all.
import { z } from "./zod.ts";

/** The most characters of the two texts a realm's facts hold; a realm path and a bech32 address are far shorter. */
export const REALM_FACTS_CAPS = { path: 256, deployer: 128 } as const;

// Not z.int(): its class would sit in the store's chunk, which the first screen loads, for a schema only a realm's page uses (F2976).
const count = z.number().check(z.refine(Number.isSafeInteger, { message: "a whole number" }), z.nonnegative());

/** The facts of one realm; a fact the indexer did not give is absent, never a zero. */
const RealmFacts = z.object({
  path: z.optional(z.string().check(z.maxLength(REALM_FACTS_CAPS.path))),
  deployer: z.optional(z.string().check(z.maxLength(REALM_FACTS_CAPS.deployer))),
  firstBlock: z.optional(count),
});
export type RealmFactsValue = z.infer<typeof RealmFacts>;

/** The indexer's GraphQL answer: `realmFacts` null for a realm it does not know. A body with `errors` is refused, even beside data. */
export const RealmFactsAnswer = z.object({
  data: z.object({ realmFacts: z.nullable(RealmFacts) }),
  errors: z.optional(z.never()),
});
export type RealmFactsAnswer = z.infer<typeof RealmFactsAnswer>;

/** The node's `tx` answer (ResultTx, rpc/core/types/responses.go:249): the hash in base64, the block's height and what the call
 * gave; a hash the node has not stored comes as an `error` whose `data` says so. */
export const TxAnswer = z.object({
  result: z.optional(
    z.object({
      hash: z.string(),
      height: z.string().check(z.regex(/^[0-9]+$/)),
      tx_result: z.object({
        ResponseBase: z.object({
          Error: z.optional(z.nullable(z.object({ "@type": z.string(), value: z.optional(z.string()) }))),
          Data: z.optional(z.nullable(z.string())),
          Log: z.optional(z.string()),
        }),
      }),
    }),
  ),
  error: z.optional(z.object({ data: z.optional(z.string()) })),
});
export type TxAnswer = z.infer<typeof TxAnswer>;

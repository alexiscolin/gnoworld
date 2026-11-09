// What the browser reads from the public indexer for a realm's facts (slice 5 part 2, 5k; 8g, F4875), and, for the realm view's call card (9d), a
// function's fees and a node's `tx`: no first-screen module reads them, so they sit here and not in the root's chain.ts. onyx-1's indexer defines no
// `realmFacts`, so a realm's facts are its deploy, the first successful MsgAddPackage of its path, as `getTransactions` answered on
// 2026-11-04 (app/tests/chain/onyxRealmDeploy.json). The indexer has no time field (F2950), so no fact here may be a count by date.
// Every text is capped, every count is a whole number: what an account or a realm wrote reaches the page as bounded text or not at all.
import { z } from "./zod.ts";

/** The most characters of the two texts a realm's facts hold; a realm path and a bech32 address are far shorter. */
export const REALM_FACTS_CAPS = { path: 256, deployer: 128, func: 128 } as const;

/** The most calls a realm's last calls hold. */
export const LAST_CALLS = 5;

// Not z.int(): its class would sit in the store's chunk, which the first screen loads, for a schema only a realm's page uses (F2976).
const count = z.number().check(z.refine(Number.isSafeInteger, { message: "a whole number" }), z.nonnegative());

/** The facts of one realm, as the reader builds them from a deploy; a fact the indexer did not give is absent, never a zero. */
export interface RealmFactsValue {
  path?: string | undefined;
  deployer?: string | undefined;
  firstBlock?: number | undefined;
}

// A message of a deploy's transaction: a MsgAddPackage with its creator and its package's path; any other message keeps its type alone.
const Message = z.object({
  value: z.object({
    __typename: z.string().check(z.maxLength(64)),
    creator: z.optional(z.string().check(z.maxLength(REALM_FACTS_CAPS.deployer))),
    package: z.optional(z.object({ path: z.string().check(z.maxLength(REALM_FACTS_CAPS.path)) })),
    // A MsgCall's caller, realm and function.
    caller: z.optional(z.string().check(z.maxLength(REALM_FACTS_CAPS.deployer))),
    pkg_path: z.optional(z.string().check(z.maxLength(REALM_FACTS_CAPS.path))),
    func: z.optional(z.string().check(z.maxLength(REALM_FACTS_CAPS.func))),
  }),
});

/** The indexer's answer to a realm's deploy: the first transaction that added its path, or null (none, or a path it does not know).
 * A body with `errors` is refused, even beside data; a transaction is checked by the reader to hold the path asked. */
export const RealmDeployAnswer = z.object({
  data: z.object({
    getTransactions: z.nullable(
      z
        .array(z.object({ block_height: count, messages: z.array(Message).check(z.maxLength(64)) }))
        .check(z.maxLength(1)),
    ),
  }),
  errors: z.optional(z.never()),
});
export type RealmDeployAnswer = z.infer<typeof RealmDeployAnswer>;

/** The indexer's answer to a realm's newest calls, newest first, with the newest block it holds (the calls' age is told in blocks, the indexer
 * having no time: F2950). A transaction may hold other messages: the reader keeps the calls to the realm asked. */
export const RealmCallsAnswer = z.object({
  data: z.object({
    latestBlockHeight: count,
    getTransactions: z.nullable(
      z
        .array(z.object({ block_height: count, messages: z.array(Message).check(z.maxLength(64)) }))
        .check(z.maxLength(LAST_CALLS)),
    ),
  }),
  errors: z.optional(z.never()),
});

/** A call of a realm: who, which function, in which block. */
export interface LastCall {
  caller: string;
  func: string;
  height: number;
}

/** A realm's newest calls and the block the indexer was at. */
export interface LastCallsValue {
  tip: number;
  calls: LastCall[];
}

// The worlds' file sits behind this door, not in the barrel: the store's chunk group takes the barrel's modules, and a world's first screen
// would pay 446 B for a schema the universe alone reads. It is what the server's job writes from the indexers.
export {
  ChainCount,
  DeployerName,
  ExportedName,
  ImportPath,
  RealmPath,
  WORLD_NATURES,
  WorldId,
  Worlds,
  WORLDS_CAPS,
  WORLDS_MAX_BYTES,
} from "./worlds.ts";
// Each realm's rollup (13a) behind it too: only a realm's plate reads one, from a chunk of its own.
export { RealmRollup, ROLLUP_CAPS, ROLLUP_MAX_GZIP } from "./realmRollup.ts";
// Who is here (7h) behind the same door: only the universe's feed reads it, after the first screen.
export {
  COUNTRIES_MOST,
  Presence,
  HubSlug,
  PRESENCE_ANSWER_MAX,
  PresencePeople,
  PRESENCE_PEOPLE_MAX_BYTES,
} from "./presence.ts";
// A world's hours (8g) too: only a plate's activity reads them, from a chunk of its own.
export { PRESENCE_HOURS, PRESENCE_HOURS_MAX_BYTES, PresenceHours } from "./hours.ts";
// The prices' history (8i) too: only the markets row's sparklines read it, from a chunk of their own.
export { MARKETS_HISTORY_MAX_BYTES, MARKETS_HISTORY_MOST, MarketsHistory } from "./marketsHistory.ts";
// The ticker's trends (7t) behind it too: only the home reads them, and the store's chunk, on every page, holds none of them.
export { Trend, Trends, TRENDS_MAX_BYTES, TRENDS_MOST } from "./trends.ts";
// The preview captures (8f) behind it too: only a page that draws a preview reads them, from a chunk of its own.
export { Capture, CAPTURE_MAX_BYTES, Previews, PREVIEWS_MAX, PREVIEWS_MAX_BYTES } from "./previews.ts";

/** The most characters of the realm path and the function a fee read names, as a CallRequest takes them. */
export const CALL_FEES_CAPS = { path: 256, func: 128 } as const;

/** The indexer's `getTransactions` for a function's calls (SHARED/recordings/README.md, not recorded): a row short of a field is
 * dropped by the reader, never a failure. */
export const CallFeesAnswer = z.object({
  data: z.object({
    getTransactions: z.nullable(
      z.array(
        z.object({
          success: z.optional(z.boolean()),
          block_height: z.optional(z.number()),
          gas_fee: z.optional(z.nullable(z.object({ amount: z.number(), denom: z.string() }))),
          messages: z.array(
            z.object({
              value: z.optional(z.object({ pkg_path: z.optional(z.string()), func: z.optional(z.string()) })),
            }),
          ),
        }),
      ),
    ),
  }),
  errors: z.optional(z.never()),
});
export type CallFeesAnswer = z.infer<typeof CallFeesAnswer>;

/** The indexer's `latestBlockHeight`: the tip a fee read counts its window back from. */
export const TipAnswer = z.object({
  data: z.object({ latestBlockHeight: count }),
  errors: z.optional(z.never()),
});

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

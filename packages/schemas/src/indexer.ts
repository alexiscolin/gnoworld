// What the browser reads from the public indexer for a realm's facts (slice 5 part 2, 5k; 8g, F4875): onyx-1's indexer defines no
// `realmFacts`, so a realm's facts are its deploy, the first successful MsgAddPackage of its path, as `getTransactions` answered on
// 2026-11-04 (app/tests/chain/onyxRealmDeploy.json). The indexer has no time field (F2950), so no fact here may be a count by date.
// Every text is capped, every count is a whole number: what an account or a realm wrote reaches the page as bounded text or not at all.
import { z } from "./zod.ts";

/** The most characters of the two texts a realm's facts hold; a realm path and a bech32 address are far shorter. */
export const REALM_FACTS_CAPS = { path: 256, deployer: 128 } as const;

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

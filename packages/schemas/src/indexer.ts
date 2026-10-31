// What the browser reads from the public indexer for a realm's facts (slice 5 part 2, 5k). THE SHAPE IS OURS, NOT RECORDED: no
// indexer answer has been read through gnomcp yet (ledger F2950), so this is the shape the reader asks for and refuses anything
// else by; the day a recording differs, this file and its test are what change. The indexer has no time field (F2950), so no fact
// here may be a count by date (`callsPerDay` waits on F2974). Every text is capped, every count is a whole number: what an account
// or a realm wrote reaches the page as bounded text or not at all.
import { z } from "./zod.ts";

/** The most characters of the two texts a realm's facts hold; a realm path and a bech32 address are far shorter. */
export const REALM_FACTS_CAPS = { path: 256, deployer: 128 } as const;

const count = z.int().check(z.nonnegative(), z.maximum(Number.MAX_SAFE_INTEGER));

/** The facts of one realm; a fact the indexer did not give is absent, never a zero. */
const RealmFacts = z.object({
  path: z.optional(z.string().check(z.maxLength(REALM_FACTS_CAPS.path))),
  deployer: z.optional(z.string().check(z.maxLength(REALM_FACTS_CAPS.deployer))),
  firstBlock: z.optional(count),
  callsPerDay: z.optional(count),
});
export type RealmFactsValue = z.infer<typeof RealmFacts>;

/** The indexer's GraphQL answer: `realmFacts` null for a realm it does not know. A body with `errors` is refused, even beside data. */
export const RealmFactsAnswer = z.object({
  data: z.object({ realmFacts: z.nullable(RealmFacts) }),
  errors: z.optional(z.never()),
});
export type RealmFactsAnswer = z.infer<typeof RealmFactsAnswer>;

// gnoscope's reads as the allowlist offers them (ADR-0002 §5; D104): four of the seven it lists, "a transaction explained,
// a realm's decoded state, an address, search over all code on chain", each with our own strict schema and `network`
// required, one of the networks Jarvis names in gnoscope's own words, so no call searches every chain it indexes. Not
// get_realm_state's wider read, which a public node nobody funds pays for. A field or a tool gnoscope gains is none.
import { Address } from "@gnoworld/schemas";
import { z } from "zod";

// gnoscope explains; the chain's own reads state (Alexis, 2026-11-04: "gnoscope pour expliquer").
const RULE =
  " gnoscope, a third party, explains: a figure it gives is stated only once a gnomcp read agrees. If gnoscope is down or slow, say so and answer from gnomcp's reads.";

/** The definitions of gnoscope's four reads for these networks; throws when one is no network's name, or none is given. */
export function gnoscopeTools(networks: readonly string[]) {
  const strange = networks.find((name) => !/^[a-z0-9][a-z0-9-]{0,39}$/.test(name));
  if (strange !== undefined)
    throw new Error(`gnoscope tools: the network ${JSON.stringify(strange)} is no network's name`);
  const [first, ...rest] = networks;
  if (first === undefined) throw new Error("gnoscope tools: no network");
  const network = z
    .enum([first, ...rest])
    .describe("The chain to read, by gnoscope's name for it: mainnet is gno.land's.");
  const explain = {
    name: "explain_tx" as const,
    description:
      "One transaction decoded by gnoscope: its messages and arguments, its events, its gas and cost, its block and time, and how far gnoscope's index lags the chain." +
      RULE,
    args: z.strictObject({
      network,
      hash: z
        .string()
        .min(1)
        .max(128)
        .regex(/^[A-Za-z0-9+/=_-]+$/)
        .describe("The transaction's hash, as the explorer and the indexer print it."),
    }),
  };
  const state = {
    name: "get_realm_state" as const,
    description:
      "A realm's live state, decoded by gnoscope from a node into a named tree of values; a large realm's comes back partial and says so." +
      RULE,
    args: z.strictObject({
      network,
      path: z
        .string()
        .max(256)
        .regex(/^gno\.land\/r\/[a-z0-9_\-/.]+$/)
        .describe("The realm's path, such as `gno.land/r/gov/dao`."),
    }),
  };
  return [explain, state, ...addressAndCode(network)];
}

function addressAndCode(network: z.ZodEnum<Record<string, string>>) {
  const address = {
    name: "get_address" as const,
    description:
      "An account on chain described by gnoscope: its balance, the realms it deployed, its calls, its transfers, its tokens, and its name when it has one." +
      RULE,
    args: z.strictObject({
      network,
      address: z
        .string()
        .regex(/^g1[02-9ac-hj-np-z]{38}$/)
        .refine((text) => Address.safeParse(text).success)
        .describe("A gno address, `g1` and 38 characters, its checksum good."),
    }),
  };
  const search = {
    name: "search_code" as const,
    description:
      "Full-text search by gnoscope over every source file the chain stores: ranked files with a snippet, never a whole file (gno_read reads one)." +
      RULE,
    args: z.strictObject({
      network,
      query: z
        .string()
        .min(1)
        .max(200)
        .describe('Words, a "quoted phrase", a prefix*, or AND, OR and NOT between them.'),
      kind: z
        .enum(["realm", "package"])
        .optional()
        .describe("Realms alone (`gno.land/r/`), or packages alone (`gno.land/p/`)."),
      limit: z.int().min(1).max(25).optional().describe("How many files at most, 25 by default."),
    }),
  };
  return [address, search];
}

// A realm's newest calls, read once for the page (D375, D530): the plate's figures and its last calls list share it.
import type { LastCallsValue } from "@gnoworld/schemas/indexer";
import type { ChainRead } from "@gnoworld/chain/read";
import { useLateRead } from "../../lateRead.ts";
import { heldRead } from "../../lib/chain/heldRead.ts";
import { readRealmCalls } from "../../lib/chain/indexer.ts";

// The reads of this session, by indexer and realm, kept while they are asked and after: a page view of a realm already read is a lookup,
// and a page that left leaves the read to the next (no abort of a shared read). A failed read is asked again.
const held = new Map<string, Promise<ChainRead<LastCallsValue>>>();

const read = (key: string) => {
  const [indexer = "", realm = ""] = key.split("\n");
  return heldRead(held, key, () => readRealmCalls(indexer, realm));
};

/** The realm's newest calls and the block the indexer was at, once read; undefined while they come. */
export const useLastCalls = (indexer: string, realm: string): ChainRead<LastCallsValue> | undefined =>
  useLateRead(`${indexer}\n${realm}`, read);

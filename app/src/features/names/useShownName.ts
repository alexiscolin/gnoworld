// The name an account is shown by, as a string for a heading: mainnet's, else Onyx's, else its short address. The pill's label (Label.tsx) draws
// the same reads as a span.
import { readName, shownName } from "../../lib/chain/names.ts";
import { pageNames } from "./pageNames.ts";
import { useReads } from "./useReads.ts";

export function useShownName(account: string, universe: string): string {
  const reads = useReads({ account, chains: pageNames(universe).chains, read: readName }, 0);
  return shownName(account, reads).text;
}

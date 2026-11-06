// The outside places a plate links to (8g, frames 40 and 93): a chain's explorer and gno.land's docs. The explorer is gnoscan, whose own
// network list holds gnoland-1 and onyx-1 and which picks one by `chainId` (its scripts, read 2026-11-04); a chain it does not list has none.
import { REALM_PREFIX } from "@gnoworld/core";

const GNOSCAN = "https://gnoscan.io";
const LISTED = new Set(["gnoland-1", "onyx-1"]);

/** gno.land's documentation. */
export const DOCS = "https://docs.gno.land/";

/** The explorer's page of a chain, or of one of its realms (`gno.land/r/...`); none for a chain the explorer does not list. */
export function explorerLink(chainId: string, realm?: string): string | undefined {
  if (!LISTED.has(chainId)) return undefined;
  const network = `chainId=${encodeURIComponent(chainId)}`;
  if (realm === undefined) return `${GNOSCAN}/?${network}`;
  return realm.startsWith(REALM_PREFIX)
    ? `${GNOSCAN}/realms/details?path=${encodeURIComponent(realm)}&${network}`
    : undefined;
}

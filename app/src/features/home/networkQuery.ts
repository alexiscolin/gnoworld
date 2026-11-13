// The home's one line of network health as a query: the server's last pass (GET /api/network), a few hundred bytes, asked again every five
// minutes while the page is open. An answer that is no good, or names a day that has not come, throws, so the last good one stays.
import { NETWORK_MAX_BYTES, NetworkAnswer } from "@gnoworld/schemas/indexer";
import { queryOptions } from "@tanstack/react-query";
import { Unread } from "../../lib/query/client.ts";
import { keys } from "../../lib/query/keys.ts";
import { readPageFile } from "../../lib/query/siteFile.ts";

const EVERY_MS = 5 * 60_000;
const DAY_MS = 86_400_000;

export const networkOptions = queryOptions({
  queryKey: keys.network(),
  refetchInterval: EVERY_MS,
  queryFn: async ({ signal }) => {
    const line = await readPageFile("/api/network", NetworkAnswer, { maxBytes: NETWORK_MAX_BYTES, signal });
    const last = line.days.at(-1);
    // A day past tomorrow's start in UTC is no day the chain has lived.
    if (last === undefined || Date.parse(`${last.day}T00:00:00Z`) > Date.now() + DAY_MS) throw new Unread(undefined);
    return line;
  },
});

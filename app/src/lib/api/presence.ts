// The browser's client of who is here (server/src/worlds/present.ts, mounted at /api/presence), through the one JSON call of
// lib/api/http.ts: counts alone, read through their schema, or why not.
import { Presence } from "@gnoworld/schemas/indexer";
import { jsonCall, TIMEOUT_MS, type Fetcher, type Result } from "./http.ts";

export function presenceApi(fetcher: Fetcher, timeoutMs = TIMEOUT_MS) {
  const call = jsonCall(fetcher, timeoutMs);
  return {
    /** Who is here in each world a guest may see. */
    read: (): Promise<Result<Presence>> => call({ path: "/api/presence", schema: Presence }),
  };
}

/** Who is here, asked on this page's own fetch. */
export const pagePresenceApi = () => presenceApi((url, init) => fetch(url, init));

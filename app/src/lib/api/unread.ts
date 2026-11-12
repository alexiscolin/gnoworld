// The browser's client of each world's unread count (server/src/unread/routes.ts, mounted at /api/unread), through the one JSON call of
// lib/api/http.ts: the counts through their schema, the places only in the shape the server takes.
import { Unread, UnreadPlaces } from "@gnoworld/schemas";
import { z } from "../jitless.ts";
import { jsonCall, TIMEOUT_MS, type Fetcher, type Result } from "./http.ts";
import { pageFetch } from "../query/policy.ts";

export interface UnreadApi {
  /** Each world's lines not yet seen. */
  counts: () => Promise<Result<Unread>>;
  /** The reading places Ergo confirmed, 100 at most. */
  places: (places: UnreadPlaces["places"]) => Promise<Result<undefined>>;
}

export function unreadApi(fetcher: Fetcher, timeoutMs = TIMEOUT_MS): UnreadApi {
  const call = jsonCall(fetcher, timeoutMs);
  return {
    counts: () => call({ path: "/api/unread", schema: Unread }),
    places: async (places) => {
      const body = UnreadPlaces.safeParse({ places });
      if (!body.success) return { ok: false, reason: "refused" };
      return call({ path: "/api/unread", body: body.data, schema: z.undefined() });
    },
  };
}

/** The unread client of this page, on its own fetch. */
export const pageUnreadApi = (): UnreadApi => unreadApi(pageFetch);

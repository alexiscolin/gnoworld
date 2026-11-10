// The browser's client of how busy a world's rooms are (server/src/activity/routes.ts, mounted at /api/activity), through the one JSON
// call of lib/api/http.ts: each room's messages a minute, read through its schema, or why not.
import { ActivityRooms } from "@gnoworld/schemas";
import { pageFetch } from "../query/policy.ts";
import { jsonCall, TIMEOUT_MS, type Fetcher, type Result } from "./http.ts";

function activityApi(fetcher: Fetcher, timeoutMs = TIMEOUT_MS) {
  const call = jsonCall(fetcher, timeoutMs);
  return {
    /** The rooms of world `slug` a reader may see, and their messages a minute. */
    read: (slug: string): Promise<Result<ActivityRooms>> =>
      call({ path: `/api/activity?worlds=${encodeURIComponent(slug)}`, schema: ActivityRooms }),
  };
}

/** The activity's client of this page, on its own fetch. */
export const pageActivityApi = () => activityApi(pageFetch);

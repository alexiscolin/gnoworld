// The browser's client of how busy a world's rooms are (server/src/activity/routes.ts, mounted at /api/activity), through the one JSON
// call of lib/api/http.ts: each room's messages a minute, read through its schema, or why not.
import { ActivityRooms } from "@gnoworld/schemas";
import { pageFetch } from "../query/policy.ts";
import { getter } from "./http.ts";

/** The activity's client of this page, on its own fetch: the rooms of world `slug` a reader may see, and their messages a minute. */
export const pageActivityApi = () => ({
  read: getter(pageFetch)(ActivityRooms, (slug: string) => `/api/activity?worlds=${encodeURIComponent(slug)}`),
});

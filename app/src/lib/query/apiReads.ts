// The server's reads as queries (slice 13): who is here, a world's activity and a world's rooms for a reader. Each on the page's own client
// (lib/api), through the per-host cap.
import { queryOptions } from "@tanstack/react-query";
import { pageActivityApi } from "../api/activity.ts";
import { pagePresenceApi } from "../api/presence.ts";
import { pageRoomsApi } from "../api/rooms.ts";
import { readApi } from "./api.ts";
import { keys } from "./keys.ts";

const MINUTE_MS = 60_000;

/** Who is here in each world, asked again each minute while a view holds it and the tab is shown. */
export const presenceOptions = queryOptions({
  queryKey: keys.presence(),
  refetchInterval: MINUTE_MS,
  queryFn: () => readApi(() => pagePresenceApi().read()),
});

/** A world's rooms' messages a minute. */
export const activityOptions = (slug: string) =>
  queryOptions({ queryKey: keys.activity(slug), queryFn: () => readApi(() => pageActivityApi().read(slug)) });

/** The rooms the server lists for `world`, for the reader `query` names (chat/names.ts's roomsQuery). */
export const roomsOptions = (world: string, query: string) =>
  queryOptions({ queryKey: keys.rooms(query), queryFn: () => readApi(() => pageRoomsApi().rooms(world)) });

// The rooms each world last listed, by the chat's query (names.ts's roomsQuery), kept by the query client: a world opened again, or one the pointer
// came over in the full chat's column, shows its rooms at once while its list is asked again behind (Alexis, 2026-11-07: "super réactif").
import type { AppState } from "../../store/index.ts";
import { Heard } from "../../lib/heard.ts";
import { roomsOptions } from "../../lib/query/apiReads.ts";
import { queryClient, quietUnread } from "../../lib/query/client.ts";
import { roomsQuery } from "./names.ts";

/** Asks `world`'s rooms for the reader ahead of a click; a failure is the click's to say. */
export function listAhead(world: string, session: AppState["login"]["session"]): void {
  const query = roomsQuery(world, session, 0);
  if (query === undefined) return;
  queryClient.query(roomsOptions(world, query)).catch(quietUnread);
}

const watchers = new Heard();

/** Tells the lists on the page that a room was made, so each asks its world's rooms again. */
export const roomsChanged = watchers.tell;

/** Calls `watcher` when a room is made, until the returned function is called. */
export const watchRoomsChanged = watchers.subscribe;

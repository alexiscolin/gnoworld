// The rooms each world last listed, by the chat's query (names.ts's roomsQuery): a world opened again, or one the pointer came over in
// the full chat's column, shows its rooms at once while its list is asked again behind (Alexis, 2026-11-07: "super réactif").
import type { RoomList } from "@gnoworld/schemas";
import type { AppState } from "../../store/index.ts";
import { Heard } from "../../lib/heard.ts";
import { pageRoomsApi } from "../../lib/api/rooms.ts";
import { roomsQuery } from "./names.ts";

// ponytail: one entry a world and reader, a handful; forgotten whole past 64.
const LISTED_MOST = 64;
const listed = new Map<string, RoomList["sections"]>();

/** What `query` listed last, or none. */
export const listedBefore = (query: string | undefined): RoomList["sections"] | undefined =>
  query === undefined ? undefined : listed.get(query);

/** Keeps what `query` listed. */
export function keepListed(query: string, sections: RoomList["sections"]): void {
  if (listed.size >= LISTED_MOST) listed.clear();
  listed.set(query, sections);
}

/** Asks `world`'s rooms for the reader ahead of a click; a failure is the click's to say. */
export function listAhead(world: string, session: AppState["login"]["session"]): void {
  const query = roomsQuery(world, session, 0);
  if (query === undefined || listed.has(query)) return;
  pageRoomsApi()
    .rooms(world)
    .then((got) => {
      if (got.ok) keepListed(query, got.value.sections);
    }, reportError);
}

const watchers = new Heard();

/** Tells the lists on the page that a room was made, so each asks its world's rooms again. */
export const roomsChanged = watchers.tell;

/** Calls `watcher` when a room is made, until the returned function is called. */
export const watchRoomsChanged = watchers.subscribe;

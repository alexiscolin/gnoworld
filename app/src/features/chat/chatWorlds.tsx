// The worlds the chat shows: the full chat's column and, for a phone's drawer, the same worlds as rows.
import { worldsFollowedIn } from "../follow/index.ts";
import { useApp } from "../../storeContext.tsx";
import type { ChatPlace } from "./ChatScreen.tsx";
import { useUnread } from "./useUnread.ts";
import { Worlds } from "./Worlds.tsx";

export function useWorldsOf(place: ChatPlace, full: boolean) {
  const follows = useApp((state) => state.device.follows);
  const unread = useUnread(full);
  const shown = {
    worlds: place.worlds,
    current: place.slug,
    followed: worldsFollowedIn(follows, place.universe.id),
    universe: place.universe,
    unread,
  };
  return { column: <Worlds {...shown} />, rows: <Worlds rows {...shown} /> };
}

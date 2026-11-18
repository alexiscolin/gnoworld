import type { RoomList } from "@gnoworld/schemas";
import { useEffectEvent, useLayoutEffect, useRef, type RefObject } from "react";
import type { useAppStore } from "../../storeContext.tsx";
import type { ChatLink } from "./connection/link.ts";
import { dropLink, takeLink } from "./connection/pageLink.ts";
import { groupRooms, roomIds } from "./rooms/names.ts";

// The page's link, taken as the panel mounts, and told the rooms to follow and the room in view: as they change, and again as it is taken,
// whatever the effects' order, or a link taken after them never hears them and the room's history is never asked. Before the room's lines'
// own effects, which read it to the link (a child's effects run before its parent's).
export function usePanelLink(
  store: ReturnType<typeof useAppStore>,
  sections: RoomList["sections"] | undefined,
  current: string | undefined,
): RefObject<ChatLink | undefined> {
  const linkRef = useRef<ChatLink>(undefined);
  const tell = useEffectEvent((link: ChatLink | undefined) => {
    if (sections !== undefined) link?.follow(roomIds(sections), groupRooms(sections));
    link?.show(current);
  });
  useLayoutEffect(() => {
    linkRef.current = takeLink(store);
    tell(linkRef.current);
    return dropLink;
  }, [store]);
  // Said again as the rooms come: a session change makes the link forget the room in view, which the new list gives back.
  useLayoutEffect(() => {
    tell(linkRef.current);
  }, [current, sections]);
  return linkRef;
}

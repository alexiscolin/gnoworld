// Jarvis's door in the chat in view (10u-a): once Jarvis is on, and the conversation is a room, the page is told so (jarvisHere.ts): the
// quick actions and the account menu wake their Jarvis, and the panel's host (features/jarvis) comes. A guest is told too: its card asks it to
// connect. The state is read once a page, whatever the rooms the person goes through.
import { RoomId, type JarvisState } from "@gnoworld/schemas";
import { useQuery } from "@tanstack/react-query";
import { useEffect } from "react";
import { queryClient } from "../../lib/query/client.ts";
import { jarvisStateOptions } from "./jarvisStateQuery.ts";
import type { Result } from "../../lib/api/http.ts";
import { tellJarvisHere } from "../../jarvisHere.ts";
import type { ChatPlace } from "./ChatScreen.tsx";

/** The room Jarvis reads from the conversation in view: a room's id, none in a direct message and on a page with no room. */
export function jarvisRoom(shown: { kind: "room" | "dm"; room: string | undefined } | undefined): string | undefined {
  if (shown?.kind !== "room") return undefined;
  const room = RoomId.safeParse(shown.room);
  return room.success ? room.data : undefined;
}

/** Whether Jarvis is on: off until the server says on, and off for any failure, which the next ask reads again. */
export function useJarvisOn(read?: () => Promise<Result<JarvisState>>): boolean {
  return useQuery(jarvisStateOptions(read), queryClient).data === true;
}

/** Tells the page where Jarvis can be asked from. Draws nothing. */
export function JarvisTold({
  place,
  shown,
  account,
}: {
  place: ChatPlace;
  shown: { kind: "room" | "dm"; writer: { room?: string | undefined } } | undefined;
  account: string | undefined;
}) {
  const on = useJarvisOn();
  const room = on && shown !== undefined ? jarvisRoom({ kind: shown.kind, room: shown.writer.room }) : undefined;
  const realm = place.realms?.[0];
  const { id, isDefault, gnoweb } = place.universe;
  useEffect(() => {
    if (room !== undefined) tellJarvisHere({ room, realm, universe: { id, isDefault, gnoweb }, account });
    return () => {
      tellJarvisHere(undefined);
    };
  }, [room, realm, id, isDefault, gnoweb, account]);
  return null;
}

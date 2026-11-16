// What the room's name opens for an account: the place's rooms under a search, and below them the room in view's notification
// mode (D13503), none for a direct message, which has no mode of its own, nor for a guest.
import type { RoomList } from "@gnoworld/schemas";
import { Stack } from "@gnoworld/ui";
import type { ReactNode } from "react";
import { NoticeModes } from "./NoticeModes.tsx";
import { RoomsList } from "./RoomsList.tsx";
import { badged } from "./unread.ts";
import type { Noticing } from "./useNotices.ts";

export function RoomsMenu({
  sections,
  room,
  failed,
  noticing,
}: {
  sections: RoomList["sections"];
  room: string | undefined;
  failed: ReactNode;
  noticing: Noticing;
}) {
  const { badges, notify } = noticing;
  return (
    <Stack space="l">
      <RoomsList sections={sections} current={room} failed={failed} badge={(id) => badged(badges?.[id])} />
      {room === undefined || notify === undefined ? null : <NoticeModes room={room} {...notify} />}
    </Stack>
  );
}

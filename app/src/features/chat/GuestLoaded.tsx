// A visitor's world, its rooms once listed (slice 4's 4b): the switcher, the room in view and its people, read alone:
// no direct message, no notice, nothing kept, no composer. What an account adds is AccountChat's, loaded for one.
import type { RoomList } from "@gnoworld/schemas";
import { Sidebar, Stack } from "@gnoworld/ui";
import type { RefObject } from "react";
import { useAppStore } from "../../storeContext.tsx";
import type { ChatLink } from "./link.ts";
import { LOG_IN_TO_READ_DMS, LOG_IN_TO_WRITE } from "./loginWords.ts";
import { roomIds } from "./names.ts";
import { roomActs } from "./roomActs.ts";
import { useGuestKeeping } from "./RoomPins.ts";
import { roomShown } from "./roomShown.ts";
import { RoomSections, RoomsNav } from "./RoomSections.tsx";
import { useRoomsDrawer } from "./RoomsDrawer.tsx";
import { People, RoomView, type RoomViewProps } from "./RoomView.tsx";
import { useThreads } from "./Threading.tsx";
import { usePins } from "./usePins.ts";
import { useRoomKeys } from "./useRoomKeys.ts";
import type { AppState } from "../../store/index.ts";

interface GuestLoadedProps {
  sections: RoomList["sections"];
  current: string | undefined;
  state: AppState["chat"]["rooms"][string] | undefined;
  verdicts: RoomViewProps["verdicts"];
  saving: boolean;
  chat: RoomViewProps["chat"];
  /** The page's link to Ergo, which marks the room in view read as its lines are reached. */
  link: RefObject<ChatLink | undefined>;
  /** The room's refused delete, said. */
  dismissed: (room: string) => void;
  /** Whether the address asks for a direct message, which a visitor has none of. */
  asksDm: boolean;
}

export function GuestLoaded({
  sections,
  current,
  state,
  verdicts,
  saving,
  chat,
  link,
  dismissed,
  asksDm,
}: GuestLoadedProps) {
  // A direct message asked for shows its problem in the room's place, as an account's does (U9).
  const room = asksDm ? undefined : current;
  useRoomKeys(roomIds(sections), room);
  const acts = roomActs(link, room ?? "", dismissed);
  const { keeping, pins } = useGuestKeeping(room, usePins(useAppStore(), room, undefined));
  const shown = room === undefined ? undefined : roomShown(room, state, acts);
  // A visitor reads a thread, whose panel says to log in where an account writes (4d's threads).
  const threads = useThreads({
    shown,
    state,
    session: { kind: "out" },
    rooms: roomIds(sections),
    acts,
    people: (
      <People members={state?.members ?? []} connected={chat === "connected"} me={undefined} onMessage={undefined} />
    ),
  });
  const rail = (
    <Stack space="s">
      <RoomsNav label="Rooms">
        <RoomSections sections={sections} current={room} />
      </RoomsNav>
    </Stack>
  );
  const rooms = useRoomsDrawer(0, rail);
  return (
    <>
      <Sidebar space="l">
        {rooms.phone ? null : rail}
        {asksDm ? <p role="status">{LOG_IN_TO_READ_DMS}</p> : null}
        {shown === undefined ? (
          rooms.control
        ) : (
          <RoomView
            rooms={rooms.control}
            key={shown.key}
            {...shown.view}
            {...threads.view}
            chat={chat}
            verdicts={verdicts}
            saving={saving}
            aside={threads.aside}
            keeping={keeping}
            pins={pins}
            composer={<p>{LOG_IN_TO_WRITE}</p>}
          />
        )}
      </Sidebar>
      {rooms.drawer}
    </>
  );
}

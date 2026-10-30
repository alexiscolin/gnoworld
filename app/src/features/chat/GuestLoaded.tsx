// A visitor's world, its rooms once listed (slice 4's 4b): the switcher, the room in view and its people, read alone:
// no direct message, no notice, nothing kept, no composer. What an account adds is AccountChat's, loaded for one.
import type { RoomList } from "@gnoworld/schemas";
import { Stack } from "@gnoworld/ui";
import { lazy, Suspense, type RefObject } from "react";
import { useAppStore } from "../../storeContext.tsx";
import { ChatScreen, Dock, type ChatPlace } from "./ChatScreen.tsx";
import type { ChatLink } from "./link.ts";
import { LOG_IN_TO_READ_DMS, LOG_IN_TO_WRITE } from "./loginWords.ts";
import { BOT, roomIds } from "./names.ts";
import { roomActs } from "./roomActs.ts";
import { useGuestKeeping } from "./RoomPins.ts";
import { roomShown, type Shown } from "./roomShown.ts";
import { RoomSections, RoomsNav } from "./RoomSections.tsx";
import type { PeopleProps } from "./People.tsx";
import { RoomView, type RoomViewOver, type RoomViewProps } from "./RoomView.tsx";
import { useThreads } from "./Threading.tsx";
import { usePins } from "./usePins.ts";
import { useRoomKeys } from "./useRoomKeys.ts";
import type { AppState } from "../../store/index.ts";

// The people's list, its code (the nebula faces, the country tags) asked once someone is here: a room nobody has joined yet
// draws none, and the first screen's budget (ADR-0001 §12) does not carry it.
const People = lazy(async () => ({ default: (await import("./People.tsx")).People }));

function PeopleHere(props: PeopleProps) {
  return props.members.some((nick) => nick !== BOT) ? (
    <Suspense fallback={null}>
      <People {...props} />
    </Suspense>
  ) : null;
}

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
  /** The world the chat is in, for its header, its column of worlds and its info panel. */
  place: ChatPlace;
}

/** The room in view and what a visitor may not do in it: a direct message asked for says the login it needs, the room has
 * no composer but the word to log in. */
function GuestRoom({
  asksDm,
  shown,
  view,
  onWhoIsHere,
}: {
  asksDm: boolean;
  shown: Shown | undefined;
  view: RoomViewOver;
  onWhoIsHere: () => void;
}) {
  return (
    <>
      {asksDm ? <p role="status">{LOG_IN_TO_READ_DMS}</p> : null}
      {shown === undefined ? null : (
        <RoomView
          key={shown.key}
          {...shown.view}
          {...view}
          composer={
            <Dock onWhoIsHere={onWhoIsHere}>
              <p>{LOG_IN_TO_WRITE}</p>
            </Dock>
          }
        />
      )}
    </>
  );
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
  place,
}: GuestLoadedProps) {
  // A direct message asked for shows its problem in the room's place, as an account's does (U9).
  const room = asksDm ? undefined : current;
  useRoomKeys(roomIds(sections), room);
  const acts = roomActs(link, room ?? "", dismissed);
  const { keeping, pins } = useGuestKeeping(room, usePins(useAppStore(), room, undefined));
  const shown = room === undefined ? undefined : roomShown(room, state, acts);
  const people = (
    <PeopleHere members={state?.members ?? []} connected={chat === "connected"} me={undefined} onMessage={undefined} />
  );
  // A visitor reads a thread, whose panel says to log in where an account writes (4d's threads).
  const threads = useThreads({
    shown,
    state,
    session: { kind: "out" },
    rooms: roomIds(sections),
    acts,
    people,
  });
  const rail = (
    <Stack space="s">
      <RoomsNav label="Rooms">
        <RoomSections sections={sections} current={room} />
      </RoomsNav>
    </Stack>
  );
  return (
    <ChatScreen
      place={place}
      title={shown?.title ?? place.name}
      rail={rail}
      unread={0}
      people={people}
      threads={threads}
    >
      {(ask) => (
        <GuestRoom
          asksDm={asksDm}
          shown={shown}
          view={{ ...threads.view, chat, verdicts, saving, keeping, pins }}
          onWhoIsHere={ask}
        />
      )}
    </ChatScreen>
  );
}

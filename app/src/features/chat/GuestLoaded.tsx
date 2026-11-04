// A visitor's world, its rooms once listed (slice 4's 4b): the switcher, the room in view and its people, read alone:
// no direct message, no notice, nothing kept, no composer. What an account adds is AccountChat's, loaded for one.
import type { RoomList } from "@gnoworld/schemas";
import type { RefObject } from "react";
import { useAppStore } from "../../storeContext.tsx";
import { chunked } from "./Failing.tsx";
import { ChatScreen, type ChatPlace } from "./ChatScreen.tsx";
import { Dock } from "./QuickActions.tsx";
import type { ChatLink } from "./link.ts";
import { LOG_IN_TO_READ_DMS, LOG_IN_TO_WRITE } from "./loginWords.ts";
import { BOT, roomIds, talkingOf } from "./names.ts";
import { roomActs } from "./roomActs.ts";
import { visitorMenu } from "./RoomMenu.tsx";
import { useGuestKeeping } from "./RoomPins.ts";
import { roomShown, type Shown } from "./roomShown.ts";
import { RoomChips } from "./RoomChips.tsx";
import { RoomSections, RoomsNav } from "./RoomSections.tsx";
import type { PeopleProps } from "./People.tsx";
import { RoomView, type RoomViewOver, type RoomViewProps } from "./RoomView.tsx";
import { useThreads } from "./Threading.tsx";
import { usePins } from "./usePins.ts";
import { useRoomKeys } from "./useRoomKeys.ts";
import type { AppState } from "../../store/index.ts";

// The people's list, its code (the nebula faces) asked once someone is here: a room nobody has joined yet
// draws none, and the first screen's budget (ADR-0001 §12) does not carry it.
// A chunk that cannot be fetched leaves the list's place with a word, never the page (F1763).
const People = chunked(async () => ({ default: (await import("./People.tsx")).People }), {
  waiting: null,
  failed: <p role="status">Who is here could not load.</p>,
});

function PeopleHere(props: PeopleProps) {
  return props.members.some((nick) => nick !== BOT) ? <People {...props} /> : null;
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
  world,
}: {
  asksDm: boolean;
  shown: Shown | undefined;
  view: RoomViewOver;
  onWhoIsHere: () => void;
  world: string;
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
            <Dock onWhoIsHere={onWhoIsHere} world={world}>
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
    <PeopleHere
      members={state?.members ?? []}
      connected={chat === "connected"}
      me={undefined}
      onMessage={undefined}
      canFollow
    />
  );
  // A visitor reads a thread, whose panel says to log in where an account writes (4d's threads).
  const threads = useThreads({
    shown,
    state,
    session: { kind: "out" },
    rooms: roomIds(sections),
    acts,
  });
  const rail = (
    <RoomsNav label="Rooms">
      <RoomSections sections={sections} current={room} />
    </RoomsNav>
  );
  return (
    <ChatScreen
      place={place}
      title={shown?.title ?? place.name}
      chips={<RoomChips sections={sections} current={room} />}
      menu={visitorMenu(shown?.note)}
      rail={rail}
      unread={0}
      talking={talkingOf(state?.members, chat === "connected")}
      people={people}
      threads={threads}
    >
      {(ask) => (
        <GuestRoom
          asksDm={asksDm}
          shown={shown}
          view={{ ...threads.view, chat, verdicts, saving, keeping, pins }}
          onWhoIsHere={ask}
          world={place.slug}
        />
      )}
    </ChatScreen>
  );
}

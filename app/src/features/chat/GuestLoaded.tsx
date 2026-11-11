// A visitor's world, its rooms once listed (slice 4's 4b): the switcher, the room in view and its people; in an open room a guest's line
// (D430), else the word to log in; no direct message, no notice, nothing kept. What an account adds is AccountChat's, loaded for one.
import type { RoomList } from "@gnoworld/schemas";
import type { ReactNode, RefObject } from "react";
import { useAppStore } from "../../storeContext.tsx";
import { chunked } from "./Failing.tsx";
import { ChatScreen, type ChatPlace } from "./ChatScreen.tsx";
import { JarvisTold } from "./jarvisTold.tsx";
import { Dock } from "./Dock.tsx";
import type { ChatLink } from "./link.ts";
import { LOG_IN_TO_READ_DMS } from "./loginWords.ts";
import { GuestWriter } from "./GuestWriter.tsx";
import { LogInToWrite } from "./LogInToWrite.tsx";
import { BOT, hereOf, roomIds, talkingOf } from "./names.ts";
import { roomActs } from "./roomActs.ts";
import { useGuestKeeping } from "./RoomPins.ts";
import { roomShown, type Shown } from "./roomShown.ts";
import { RoomChips } from "./RoomChips.tsx";
import { RoomsList, RoomsNav } from "./RoomsList.tsx";
import type { PeopleProps } from "./People.tsx";
import { NoRoomYet, RoomView, type RoomViewOver, type RoomViewProps } from "./RoomView.tsx";
import { useThreads } from "./Threading.tsx";
import { useNow } from "./useNow.ts";
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

// The room in view where a guest may speak: an open room of the list (D430); the server holds the rest of the rule.
const openRoom = (sections: RoomList["sections"], room: string | undefined) =>
  sections.some(({ rooms }) => rooms.some((each) => each.room === room && each.type === "open")) ? room : undefined;

// Who is here, for a visitor: none to write to, each with the country they declared.
const peopleOf = (state: GuestLoadedProps["state"], connected: boolean) => (
  <PeopleHere
    members={state?.members ?? []}
    connected={connected}
    me={undefined}
    onMessage={undefined}
    canFollow
    lines={state?.lines}
  />
);

/** The room in view and what a visitor may do in it: a direct message asked for says the login it needs; an open room takes a guest's
 * line, any other has the word to log in. */
function GuestRoom({
  asksDm,
  shown,
  view,
  place,
  open,
}: {
  asksDm: boolean;
  shown: Shown | undefined;
  view: RoomViewOver;
  place: ChatPlace;
  open: string | undefined;
}) {
  return (
    <>
      <JarvisTold place={place} shown={shown} account={undefined} />
      {asksDm ? <p role="status">{LOG_IN_TO_READ_DMS}</p> : null}
      {shown === undefined ? (
        asksDm ? null : (
          <NoRoomYet />
        )
      ) : (
        <RoomView
          key={shown.key}
          {...shown.view}
          {...view}
          composer={
            <Dock pinned={place.pinned}>{open === undefined ? <LogInToWrite /> : <GuestWriter room={open} />}</Dock>
          }
        />
      )}
    </>
  );
}

const titleOf = (shown: { title?: ReactNode } | undefined, name: ReactNode): ReactNode => shown?.title ?? name;

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
  const live = chat === "connected";
  const room = asksDm ? undefined : current;
  useRoomKeys(roomIds(sections), room);
  const acts = roomActs(link, room ?? "", dismissed);
  const { keeping, pins } = useGuestKeeping(room, usePins(useAppStore(), room, undefined));
  const shown = room === undefined ? undefined : roomShown(room, state, acts);
  const people = peopleOf(state, live);
  // A visitor reads a thread, whose panel says to log in where an account writes (4d's threads).
  const threads = useThreads({
    shown,
    state,
    session: { kind: "out" },
    rooms: roomIds(sections),
    acts,
  });
  const now = useNow();
  const rail = (
    <RoomsNav label="Rooms">
      <RoomsList sections={sections} current={room} />
    </RoomsNav>
  );
  return (
    <ChatScreen
      place={place}
      title={titleOf(shown, place.name)}
      chips={<RoomChips sections={sections} current={room} />}
      menu={{ label: "Rooms", content: <RoomsList sections={sections} current={room} /> }}
      rail={rail}
      unread={0}
      talking={talkingOf(state?.lines ?? [], now, live)}
      present={hereOf(state?.members, live)}
      here={state}
      people={people}
      threads={threads}
      search={{ room, sections, members: state?.members ?? [], me: undefined, link }}
    >
      <GuestRoom
        asksDm={asksDm}
        shown={shown}
        view={{ ...threads.view, chat, verdicts, saving, keeping, pins }}
        place={place}
        open={openRoom(sections, room)}
      />
    </ChatScreen>
  );
}

// The world's rooms once listed (slice 4's 4b, moved out of ChatPanel.tsx): the switcher, the conversation in view (a
// room, or a direct message, 4e) and what writes in it.
import type { Line } from "@gnoworld/core";
import type { RoomList } from "@gnoworld/schemas";
import { useId, type ReactNode, type RefObject } from "react";
import { useAppStore } from "../../storeContext.tsx";
import type { AppState } from "../../store/index.ts";
import type { Dms } from "./Dms.tsx";
import type { ChatLink } from "./link.ts";
import { useComposing } from "./composing.ts";
import { dmActs } from "./dmActs.ts";
import type { Say } from "./linkTypes.ts";
import { groupsAt, hereOf, roomIds, talkingOf } from "./names.ts";
import { multilineOf, roomActs } from "./roomActs.ts";
import { useRoomKeeping } from "./RoomKeeping.ts";
import { RoomChips } from "./RoomChips.tsx";
import { ChatScreen, type ChatPlace } from "./ChatScreen.tsx";
import { Dock, quickActionsOf } from "./Dock.tsx";
import { Saved } from "./Saved.tsx";
import { Media } from "./Media.tsx";
import { NoticeStatus, RoomsView } from "./RoomsView.tsx";
import { RoomsList } from "./RoomsList.tsx";
import { badged, unreadOf } from "./unread.ts";
import { useOpened, useWhoIsHere } from "./whoIsHere.tsx";
import { NoRoomYet, RoomView, type RoomViewOver, type RoomViewProps } from "./RoomView.tsx";
import { shownOf } from "./shown.tsx";
import { usePins } from "./usePins.ts";
import type { Shown } from "./roomShown.ts";
import { useNow } from "./useNow.ts";
import { useRoomKeys } from "./useRoomKeys.ts";
import type { Noticing } from "./useNotices.ts";
import { useThreads } from "./Threading.tsx";
import { Writer } from "./Writer.tsx";

const NO_LINES: readonly Line[] = [];
const NO_MEMBERS: readonly string[] = [];

const addressOf = (session: AppState["login"]["session"]) => (session.kind === "in" ? session.address : undefined);

// The world's rooms once listed: the switcher, the room in view and what writes in it.
export interface LoadedProps {
  sections: RoomList["sections"];
  current: string | undefined;
  state: AppState["chat"]["rooms"][string] | undefined;
  verdicts: RoomViewProps["verdicts"];
  saving: boolean;
  chat: RoomViewProps["chat"];
  session: AppState["login"]["session"];
  /** The page's link to Ergo, which says and deletes the room in view's lines (4c), tells the account's typing and
   * marks the room read (4f). */
  link: RefObject<ChatLink | undefined>;
  /** The room's refused delete, said. */
  dismissed: (room: string) => void;
  /** The conversation's refused delete or reaction, said (4d's DM bar). */
  dmDismissed: (partner: string) => void;
  /** Sends what the composer composed to another account (4e), answering a line or correcting one when it says so. */
  sayTo: (partner: string, say: Say, tags?: { reply?: string; edit?: string }) => boolean;
  dms: Dms;
  /** What the account was told and has not seen (4f-n). */
  noticing: Noticing;
  /** What says the rooms could not load, in their place, while a direct message shows (CR8). */
  failed?: ReactNode;
  /** The world the chat is in, for its header, its column of worlds and its info panel. */
  place: ChatPlace;
}

// The rooms' column: the rooms, and for an account its saved messages, a button between them and the conversations until slice 8's menu (4d).
// On a phone it sits in the rooms' drawer instead (5b), without the column's width.
function Rail({
  signedIn,
  sections,
  current,
  lines,
  dms,
  failed,
  noticing,
}: Pick<LoadedProps, "sections" | "dms" | "failed" | "noticing"> & {
  signedIn: boolean;
  current: string | undefined;
  lines: readonly Line[];
}) {
  return (
    <RoomsView
      sections={sections}
      current={current}
      dms={dms.nav}
      failed={failed}
      badges={noticing.badges}
      notices={noticing.list}
      media={<Media room={current} lines={lines} />}
      saved={signedIn ? <Saved /> : undefined}
    />
  );
}

/** The conversation in view and what names it: the room (none while a direct message or its problem is in view), the
 * reader, who is here and what each part of the conversation is told. */
function useConversation(props: LoadedProps) {
  const { sections, current, state, chat, session, link, dismissed, dmDismissed, sayTo, dms, noticing } = props;
  // One conversation in view: the direct message ?dm= names, else the room. Alt+Up and Alt+Down move between rooms,
  // none while a direct message is in view (U15).
  const room = dms.partner === undefined && dms.problem === undefined ? current : undefined;
  useRoomKeys(roomIds(sections), room);
  const acts = roomActs(link, room ?? "", dismissed);
  const me = addressOf(session);
  const opened = useOpened(dms.partner);
  const noteId = useId();
  const people = useWhoIsHere(state, { connected: chat === "connected", me }, opened.open);
  const bar = dms.partner === undefined ? undefined : dmActs(link, dms.partner, dmDismissed);
  const shown = shownOf(
    dms,
    { id: room, state, acts },
    { sayTo, focus: opened.focus, noteId, seen: noticing.seen, acts: bar },
  );
  const lines = state?.lines ?? NO_LINES;
  return { room, acts, me, people, shown, lines, members: state?.members ?? NO_MEMBERS };
}

/** The conversation in view: a direct message's problem, said in the room's place, then the room with its composer. */
function LoadedRoom({
  problem,
  shown,
  view,
  composer,
}: {
  problem: ReactNode;
  shown: Shown | undefined;
  view: RoomViewOver;
  composer: ReactNode;
}) {
  const room = shown && <RoomView key={shown.key} {...shown.view} {...view} composer={composer} />;
  return (
    <>
      {problem === undefined ? null : <p role="status">{problem}</p>}
      {room ?? (problem === undefined ? <NoRoomYet /> : null)}
    </>
  );
}

export function Loaded(props: LoadedProps) {
  const { sections, verdicts, saving, chat, session, link, dms, noticing, failed, place } = props;
  const { room, acts, me, people, shown, lines, members } = useConversation(props);
  const now = useNow();
  const ids = roomIds(sections);
  // What the reader keeps in the room in view and the room's pins, which are asked for it: none for a direct message.
  const { keeping, pins } = useRoomKeeping(room, usePins(useAppStore(), room, me));
  const composing = useComposing(shown, me);
  const threads = useThreads({ shown, state: props.state, session, rooms: ids, acts });
  const rail = (
    <Rail signedIn={me !== undefined} {...{ sections, dms, failed }} current={room} lines={lines} noticing={noticing} />
  );
  const writer =
    shown === undefined ? undefined : (
      <Writer
        session={session}
        rooms={ids}
        groups={groupsAt(sections, room)}
        multiline={multilineOf(link)}
        quick={quickActionsOf(place, shown, session)}
        {...shown.writer}
        {...composing.writer}
      />
    );
  // The room's name opens the place's rooms under a search (D487); the room's settings wait for their own place.
  const menu = <RoomsList sections={sections} current={room} badge={(id) => badged(noticing.badges?.[id])} />;
  return (
    <ChatScreen
      place={place}
      title={shown?.title ?? place.name}
      chips={<RoomChips sections={sections} current={room} badges={noticing.badges} />}
      menu={{ label: "Rooms", content: menu }}
      mark={shown?.mark}
      rail={rail}
      unread={unreadOf(noticing.badges)}
      talking={talkingOf(lines, now, chat === "connected")}
      present={hereOf(props.state?.members, chat === "connected")}
      here={{ lines, members }}
      people={people}
      threads={threads}
      status={<NoticeStatus notices={noticing.list} />}
    >
      <LoadedRoom
        problem={dms.problem}
        shown={shown}
        view={{
          verdicts,
          saving,
          keeping,
          pins,
          chat,
          me,
          ...composing.view,
          ...threads.view,
        }}
        composer={<Dock pinned={place.pinned}>{writer}</Dock>}
      />
    </ChatScreen>
  );
}

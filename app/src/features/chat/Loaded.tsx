// The world's rooms once listed: the switcher, the conversation in view (a room, or a direct message) and what writes in it.
import type { Line } from "@gnoworld/core";
import type { RoomList } from "@gnoworld/schemas";
import { Chip } from "@gnoworld/ui";
import { useId, type ReactNode, type RefObject } from "react";
import { useLinks } from "../../useLinks.ts";
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
import { JarvisTold } from "./jarvisTold.tsx";
import { Saved } from "./Saved.tsx";
import { Media } from "./Media.tsx";
import { NoticeStatus, RoomsView } from "./RoomsView.tsx";
import { NoticeModes } from "./NoticeModes.tsx";
import { RoomsMenu } from "./RoomsMenu.tsx";
import { unreadOf } from "./unread.ts";
import { useOpened, useWhoIsHere } from "./whoIsHere.tsx";
import type { RoomViewProps } from "./RoomView.tsx";
import { LoadedRoom } from "./LoadedRoom.tsx";
import { shownOf } from "./shown.tsx";
import { usePins } from "./usePins.ts";
import type { Shown } from "./roomShown.ts";
import { useNow } from "./useNow.ts";
import { useRoomKeys } from "./useRoomKeys.ts";
import type { Noticing } from "./useNotices.ts";
import { useThreads } from "./Threading.tsx";
import { RoomWriter } from "./Writer.tsx";

const NO_LINES: readonly Line[] = [];
const NO_MEMBERS: readonly string[] = [];

// The room's own world, the id's first segment: a hub's other realms' rooms are other worlds, which the hint does not name.
const ownsRoom = (worlds: readonly string[] | undefined, room: string | undefined) =>
  room !== undefined && worlds?.includes(room.slice(1).split("/")[0] ?? "") === true;

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
  /** The page's link to Ergo, which says and deletes the room in view's lines, tells the account's typing and
   * marks the room read. */
  link: RefObject<ChatLink | undefined>;
  /** The room's refused delete, said. */
  dismissed: (room: string) => void;
  /** The conversation's refused delete or reaction, said. */
  dmDismissed: (partner: string) => void;
  /** Sends what the composer composed to another account, answering a line or correcting one when it says so. */
  sayTo: (partner: string, say: Say, tags?: { reply?: string; edit?: string }) => boolean;
  dms: Dms;
  /** What the account was told and has not seen. */
  noticing: Noticing;
  /** What says the rooms could not load, in their place, while a direct message shows. */
  failed?: ReactNode;
  /** The world the chat is in, for its header, its column of worlds and its info panel. */
  place: ChatPlace;
}

// The rooms' column: the rooms, and for an account its saved messages, a button between them and the conversations.
// On a phone it sits in the rooms' drawer instead, without the column's width.
function Rail({
  signedIn,
  sections,
  current,
  dms,
  failed,
  noticing,
}: Pick<LoadedProps, "sections" | "dms" | "failed" | "noticing"> & {
  signedIn: boolean;
  current: string | undefined;
}) {
  return (
    <RoomsView
      sections={sections}
      current={current}
      dms={dms.nav}
      failed={failed}
      badges={noticing.badges}
      notices={noticing.list}
      media={<Media room={current} />}
      saved={signedIn ? <Saved /> : undefined}
    />
  );
}

/** The conversation in view and what names it: the room (none for a direct message), the reader, who is here, what each part is told. */
function useConversation(props: LoadedProps) {
  const { sections, current, state, chat, session, link, dismissed, dmDismissed, sayTo, dms, noticing } = props;
  // One conversation in view: the direct message ?dm= names, else the room (Alt+Up and Alt+Down move between rooms).
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
  return { room, acts, me, people, shown, lines, noteId, members: state?.members ?? NO_MEMBERS };
}

// What the composer's description points at: the header shows a direct message's mark, a screen reader hears its note.
function DmNote({ shown, id }: { shown: Shown | undefined; id: string }) {
  return shown?.kind === "dm" ? (
    <p id={id} className="visually-hidden">
      {shown.note}
    </p>
  ) : null;
}

// The room's notification modes, for a phone's drawer: none for a guest or a direct message.
const modesOf = (room: string | undefined, { notify }: Noticing) =>
  room === undefined || notify === undefined ? undefined : <NoticeModes room={room} {...notify} />;

export function Loaded(props: LoadedProps) {
  const { sections, verdicts, saving, chat, session, link, dms, noticing, place } = props;
  const { room, acts, me, people, shown, lines, members, noteId } = useConversation(props);
  // The rooms that could not load: said in the conversation's place, and in the rooms' list only beside a direct message.
  const failed = shown === undefined ? undefined : props.failed;
  const now = useNow();
  // The owner of the place's world wears a mark beside the room's name; the server's list says who owns what.
  const owner = ownsRoom(useLinks(me)?.worlds, room);
  const ids = roomIds(sections);
  // What the reader keeps in the room in view and the room's pins, which are asked for it: none for a direct message.
  const { keeping, pins } = useRoomKeeping(room, usePins(useAppStore(), room, me));
  const composing = useComposing(shown, me);
  const threads = useThreads({ shown, state: props.state, session, rooms: ids, acts });
  const rail = <Rail signedIn={me !== undefined} {...{ sections, dms, failed }} current={room} noticing={noticing} />;
  const writer =
    shown === undefined ? undefined : (
      <RoomWriter
        session={session}
        rooms={ids}
        groups={groupsAt(sections, room)}
        multiline={multilineOf(link)}
        quick={quickActionsOf(place, shown, session)}
        {...shown.writer}
        {...composing.writer}
      />
    );
  return (
    <ChatScreen
      place={place}
      title={shown?.title ?? place.name}
      chips={<RoomChips sections={sections} current={room} badges={noticing.badges} />}
      modes={modesOf(room, noticing)}
      menu={{
        label: "Rooms",
        content: <RoomsMenu sections={sections} room={room} failed={failed} noticing={noticing} />,
      }}
      mark={
        owner ? (
          <>
            {shown?.mark}
            <Chip tone="signal">Owner</Chip>
          </>
        ) : (
          shown?.mark
        )
      }
      rail={rail}
      unread={unreadOf(noticing.badges)}
      talking={talkingOf(lines, now, chat === "connected")}
      present={hereOf(props.state?.members, chat === "connected")}
      here={{ lines, members }}
      people={people}
      threads={threads}
      search={{ room, sections, members, me, link }}
      status={<NoticeStatus notices={noticing.list} />}
    >
      <JarvisTold place={place} shown={shown} account={me} />
      <LoadedRoom
        failed={props.failed}
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
        composer={
          <>
            <DmNote shown={shown} id={noteId} />
            <Dock pinned={place.pinned}>{writer}</Dock>
          </>
        }
      />
    </ChatScreen>
  );
}

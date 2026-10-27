// The world's rooms once listed (slice 4's 4b, moved out of ChatPanel.tsx): the switcher, the conversation in view (a
// room, or a direct message, 4e) and what writes in it.
import type { RoomList } from "@gnoworld/schemas";
import { Sidebar } from "@gnoworld/ui";
import { useEffect, useId, useLayoutEffect, useRef, useState, type ReactNode, type RefObject } from "react";
import { useSearchParams } from "react-router";
import type { AppState } from "../../store/index.ts";
import type { Dms } from "./Dms.tsx";
import type { ChatLink } from "./link.ts";
import { dmParams, neighbour, roomIds, roomParams } from "./names.ts";
import { useComposing } from "./composing.ts";
import { dmActs } from "./dmActs.ts";
import { roomActs } from "./roomActs.ts";
import { RoomsView } from "./RoomsView.tsx";
import { People, RoomView, type RoomViewProps } from "./RoomView.tsx";
import { shownOf } from "./shown.tsx";
import { Writer } from "./Writer.tsx";

// Alt+Up and Alt+Down: the room before or after the one in view, anywhere on the page (ADR-0002's chat rows). A key
// pressed before the page draws the room the last one went to starts from that room: the hook keeps it, and the room
// in view, once drawn or chosen otherwise, sets it again.
function useRoomKeys(rooms: readonly string[], current: string | undefined) {
  const [, setParams] = useSearchParams();
  const fromRef = useRef(current);
  useLayoutEffect(() => {
    fromRef.current = current;
  }, [current]);
  useEffect(() => {
    const go = (event: globalThis.KeyboardEvent) => {
      const step = { ArrowUp: -1, ArrowDown: 1 }[event.key];
      const alone = event.altKey && !event.shiftKey && !event.ctrlKey && !event.metaKey;
      const from = fromRef.current;
      const next = alone && step !== undefined && from !== undefined ? neighbour(rooms, from, step) : undefined;
      if (next === undefined) return;
      event.preventDefault();
      fromRef.current = next;
      setParams(roomParams(next));
    };
    window.addEventListener("keydown", go);
    return () => {
      window.removeEventListener("keydown", go);
    };
  }, [rooms, setParams]);
}

// The conversation opened from who is here, whose composer takes the focus as its button goes (U12): asked while it is
// in view, `partner` the one in view, never again once the reader left it (CR6).
function useOpened(partner: string | undefined) {
  const [opened, setOpened] = useState<{ partner: string; seen: boolean }>();
  if (opened?.seen === false && partner === opened.partner) setOpened({ ...opened, seen: true });
  if (opened?.seen === true && partner !== opened.partner) setOpened(undefined);
  return {
    focus: opened !== undefined && opened.partner === partner,
    open: (other: string) => {
      setOpened({ partner: other, seen: false });
    },
  };
}

const addressOf = (session: AppState["login"]["session"]) => (session.kind === "in" ? session.address : undefined);

// The world's rooms once listed: the switcher, the room in view and what writes in it.
interface LoadedProps {
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
  /** Sends a draft to another account (4e), answering a line or correcting one when it says so. */
  sayTo: (partner: string, draft: string, tags?: { reply?: string; edit?: string }) => boolean;
  dms: Dms;
  /** What says the rooms could not load, in their place, while a direct message shows (CR8). */
  failed?: ReactNode;
}

export function Loaded({
  sections,
  current,
  state,
  verdicts,
  saving,
  chat,
  session,
  link,
  dismissed,
  dmDismissed,
  sayTo,
  dms,
  failed,
}: LoadedProps) {
  const ids = roomIds(sections);
  // One conversation in view: the direct message ?dm= names, else the room. Alt+Up and Alt+Down move between rooms,
  // none while a direct message is in view (U15).
  const room = dms.partner === undefined && dms.problem === undefined ? current : undefined;
  useRoomKeys(ids, room);
  const acts = roomActs(link, room ?? "", dismissed);
  const [, setParams] = useSearchParams();
  const me = addressOf(session);
  const opened = useOpened(dms.partner);
  const noteId = useId();
  // Apart from the room's element, which each line draws again: who is here keeps its drawing (the compiler).
  const onMessage = (other: string) => {
    opened.open(other);
    setParams(dmParams(other));
  };
  const people = (
    <People members={state?.members ?? []} connected={chat === "connected"} me={me} onMessage={onMessage} />
  );
  const bar = dms.partner === undefined ? undefined : dmActs(link, dms.partner, dmDismissed);
  const shown = shownOf(dms, { id: room, state, acts }, { sayTo, focus: opened.focus, noteId, acts: bar });
  const composing = useComposing(shown, me);
  return (
    <Sidebar space="l">
      <RoomsView sections={sections} current={room} dms={dms.nav} failed={failed} />
      {dms.problem === undefined ? null : <p role="status">{dms.problem}</p>}
      {shown === undefined ? null : (
        <RoomView
          key={shown.key}
          {...shown.view}
          verdicts={verdicts}
          saving={saving}
          aside={shown.kind === "room" ? people : undefined}
          chat={chat}
          me={me}
          noteId={noteId}
          {...composing.view}
          composer={<Writer session={session} rooms={ids} {...shown.writer} {...composing.writer} />}
        />
      )}
    </Sidebar>
  );
}

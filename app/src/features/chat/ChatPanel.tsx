// A world's chat on its page (slice 4's 4b): its rooms from the server, asked once the session is known and again
// when it changes (a member's rooms are not a guest's), the page's link to Ergo in them, and the room the address names
// (?room=<name>), else the world's main room, else the first listed, the one whose history the link asks. The
// link lives as long as the page: leaving the world leaves Ergo. An account writes in the room through the link
// (4c); a guest reads, a room letting accounts alone speak.
import type { RoomList } from "@gnoworld/schemas";
import { Button, Sidebar, Stack } from "@gnoworld/ui";
import { useEffect, useId, useLayoutEffect, useRef, useState } from "react";
import { useSearchParams } from "react-router";
import { pageLoginApi } from "../../lib/api/login.ts";
import { pageDmPrefs } from "../../lib/dms/page.ts";
import { pageDrafts } from "../../lib/drafts/page.ts";
import { pageRoomsApi } from "../../lib/api/rooms.ts";
import { drawGuestNick } from "../../lib/ergo/ergo.ts";
import { pageErgo } from "../../lib/ergo/page.ts";
import type { AppState } from "../../store/index.ts";
import { useApp, useAppStore } from "../../storeContext.tsx";
import { useDms, type Dms } from "./Dms.tsx";
import { chatLink } from "./link.ts";
import { LOADING } from "./Loading.tsx";
import { dmParams, neighbour, roomIds, roomParams, roomsQuery, shownRoom } from "./names.ts";
import { RoomsView } from "./RoomsView.tsx";
import { People, RoomView, type RoomViewProps } from "./RoomView.tsx";
import { dmShown, roomShown } from "./shown.tsx";
import { Writer } from "./Writer.tsx";

// The rooms as last asked, and what came: undefined when the list could not load.
interface Asked {
  query: string;
  sections: RoomList["sections"] | undefined;
}

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

// The world's rooms once listed: the switcher, the room in view and what writes in it.
interface LoadedProps {
  sections: RoomList["sections"];
  current: string | undefined;
  state: AppState["chat"]["rooms"][string] | undefined;
  chat: RoomViewProps["chat"];
  session: AppState["login"]["session"];
  say: (room: string, draft: string) => boolean;
  /** Sends a draft to another account (4e). */
  sayTo: (partner: string, draft: string) => boolean;
  dms: Dms;
}

function Loaded({ sections, current, state, chat, session, say, sayTo, dms }: LoadedProps) {
  const ids = roomIds(sections);
  // One conversation in view: the direct message ?dm= names, else the room. Alt+Up and Alt+Down move between rooms,
  // none while a direct message is in view (U15).
  const room = dms.partner === undefined ? current : undefined;
  useRoomKeys(ids, room);
  const [, setParams] = useSearchParams();
  const me = session.kind === "in" ? session.address : undefined;
  // The conversation opened from who is here, whose composer takes the focus as its button goes (U12).
  const [opened, setOpened] = useState<string>();
  const noteId = useId();
  // Apart from the room's element, which each line draws again: who is here keeps its drawing (the compiler).
  const onMessage = (other: string) => {
    setOpened(other);
    setParams(dmParams(other));
  };
  const people = (
    <People members={state?.members ?? []} connected={chat === "connected"} me={me} onMessage={onMessage} />
  );
  const shown =
    dms.partner === undefined
      ? room === undefined
        ? undefined
        : roomShown(room, state, say)
      : dmShown(dms.partner, dms, { sayTo, focus: opened === dms.partner, noteId });
  return (
    <Sidebar space="l">
      <RoomsView sections={sections} current={room} dms={dms.nav} />
      {shown === undefined ? null : (
        <RoomView
          key={shown.key}
          {...shown.view}
          aside={shown.key === "room" ? people : undefined}
          chat={chat}
          me={me}
          noteId={noteId}
          composer={<Writer session={session} rooms={ids} {...shown.writer} />}
        />
      )}
    </Sidebar>
  );
}

// The page's link to Ergo: the page's socket, the login's tickets, a guest's drawn nick, an account's device.
const pageLink = (store: ReturnType<typeof useAppStore>) =>
  chatLink({
    store,
    connect: pageErgo,
    ticket: pageLoginApi().ticket,
    guest: drawGuestNick,
    device: (account) => ({ prefs: pageDmPrefs(account), drafts: pageDrafts(account) }),
  });

export function ChatPanel({ world }: { world: string }) {
  const store = useAppStore();
  // The page's link to Ergo, made once the page runs: never in the build's pre-render.
  const linkRef = useRef<ReturnType<typeof chatLink>>(undefined);
  const [asked, setAsked] = useState<Asked>();
  const [attempt, setAttempt] = useState(0);
  const [params] = useSearchParams();
  const session = useApp(({ login }) => login.session);
  const query = roomsQuery(world, session, attempt);
  useEffect(() => {
    const made = pageLink(store);
    linkRef.current = made;
    return () => {
      made.stop();
    };
  }, [store]);
  useEffect(() => {
    if (query === undefined) return;
    let live = true;
    const settle = (sections: Asked["sections"]) => {
      if (live) setAsked({ query, sections });
    };
    pageRoomsApi()
      .rooms(world)
      .then(
        (got) => {
          settle(got.ok ? got.value.sections : undefined);
        },
        () => {
          settle(undefined);
        },
      );
    return () => {
      live = false;
    };
  }, [world, query]);
  const loaded = query !== undefined && asked?.query === query;
  const sections = loaded ? asked.sections : undefined;
  useEffect(() => {
    if (sections !== undefined) linkRef.current?.follow(roomIds(sections));
  }, [sections]);
  const current = sections === undefined ? undefined : shownRoom(world, sections, params.get("room"));
  useEffect(() => {
    linkRef.current?.show(current);
  }, [current]);
  const state = useApp((app) => (current === undefined ? undefined : app.chat.rooms[current]));
  const dms = useDms(world, session, params.get("dm"));
  const chat = useApp((app) => app.login.chat);
  if (!loaded) return LOADING;
  if (sections === undefined) {
    return (
      <Stack space="s">
        <p role="alert">The rooms could not load.</p>
        <Button
          onClick={() => {
            setAttempt((n) => n + 1);
          }}
        >
          Try again
        </Button>
      </Stack>
    );
  }
  return (
    <Loaded
      sections={sections}
      current={current}
      state={state}
      chat={chat}
      session={session}
      say={(room, draft) => linkRef.current?.say(room, draft) ?? false}
      sayTo={(partner, draft) => linkRef.current?.sayTo(partner, draft) ?? false}
      dms={dms}
    />
  );
}

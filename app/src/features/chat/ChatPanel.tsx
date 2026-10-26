// A world's chat on its page (slice 4's 4b): its rooms from the server, asked once the session is known and again
// when it changes (a member's rooms are not a guest's), the page's link to Ergo in them, and the room the address names
// (?room=<name>), else the world's main room, else the first listed, the one whose history the link asks. The
// link lives as long as the page: leaving the world leaves Ergo. An account writes in the room through the link
// (4c); a guest reads, a room letting accounts alone speak.
import type { RoomList } from "@gnoworld/schemas";
import { Button, Sidebar, Stack } from "@gnoworld/ui";
import { lazy, Suspense, useEffect, useLayoutEffect, useRef, useState } from "react";
import { useSearchParams } from "react-router";
import { pageLoginApi } from "../../lib/api/login.ts";
import { pageRoomsApi } from "../../lib/api/rooms.ts";
import { pageDrafts } from "../../lib/drafts/page.ts";
import { drawGuestNick } from "../../lib/ergo/ergo.ts";
import { pageErgo } from "../../lib/ergo/page.ts";
import { savesData } from "../../lib/saveData.ts";
import type { AppState } from "../../store/index.ts";
import { useApp, useAppStore } from "../../storeContext.tsx";
import { chatLink } from "./link.ts";
import { LOADING } from "./Loading.tsx";
import { neighbour, roomIds, roomLabel, roomParams, roomsQuery, shownRoom } from "./names.ts";
import { RoomsView } from "./RoomsView.tsx";
import { RoomView, type RoomViewProps } from "./RoomView.tsx";
import { useVerdicts } from "./useVerdicts.ts";

// The rooms as last asked, and what came: undefined when the list could not load.
interface Asked {
  query: string;
  sections: RoomList["sections"] | undefined;
}

// The composer, an account's alone: a visitor's page never loads its code (the first screen's budget, ADR-0001 §12).
const Composer = lazy(async () => ({ default: (await import("./Composer.tsx")).Composer }));

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

// Under a room's lines: the composer for an account, which writes through the link; a word for a guest.
// The word being typed completes to a room of the world's, by its label, or to another account in the room.
interface WriterProps {
  session: AppState["login"]["session"];
  room: string;
  rooms: readonly string[];
  members: readonly string[];
  onSay: (draft: string) => boolean;
}

function Writer({ session, room, rooms, members, onSay }: WriterProps) {
  if (session.kind !== "in") return <p>Log in to write in this room.</p>;
  // The account's drafts on this device: the room's, where the composer starts, and each change kept (4d).
  const kept = pageDrafts(session.address);
  return (
    <Suspense fallback={null}>
      <Composer
        draft={kept.get(room)}
        onDraft={(draft) => {
          kept.set(room, draft);
        }}
        key={room}
        room={room}
        nick={session.address}
        rooms={rooms.map(roomLabel)}
        members={members}
        onSay={onSay}
      />
    </Suspense>
  );
}

// The world's rooms once listed: the switcher, the room in view and what writes in it.
interface LoadedProps {
  sections: RoomList["sections"];
  current: string | undefined;
  state: RoomViewProps["state"];
  verdicts: RoomViewProps["verdicts"];
  saving: boolean;
  chat: RoomViewProps["chat"];
  session: AppState["login"]["session"];
  say: (room: string, draft: string) => boolean;
}

function Loaded({ sections, current, state, verdicts, saving, chat, session, say }: LoadedProps) {
  const ids = roomIds(sections);
  useRoomKeys(ids, current);
  return (
    <Sidebar space="l">
      <RoomsView sections={sections} current={current} />
      {current === undefined ? null : (
        <RoomView
          room={current}
          state={state}
          verdicts={verdicts}
          saving={saving}
          chat={chat}
          me={session.kind === "in" ? session.address : undefined}
          composer={
            <Writer
              session={session}
              room={current}
              rooms={ids}
              members={state?.members ?? []}
              onSay={(draft) => say(current, draft)}
            />
          }
        />
      )}
    </Sidebar>
  );
}

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
    const made = chatLink({ store, connect: pageErgo, ticket: pageLoginApi().ticket, guest: drawGuestNick });
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
  // Data saver, read once the page runs: the players and the verdicts they wait on agree, whatever it says later.
  const [saving] = useState(savesData);
  const reader = session.kind === "in" ? session.address : undefined;
  useVerdicts(store, { room: current, lines: state?.lines, reader, saving });
  const verdicts = useApp((app) => (current === undefined ? undefined : app.verdicts[current]));
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
      verdicts={verdicts}
      saving={saving}
      chat={chat}
      session={session}
      say={(room, draft) => linkRef.current?.say(room, draft) ?? false}
    />
  );
}

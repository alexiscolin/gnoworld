// A world's chat on its page (slice 4's 4b): its rooms from the server, asked once the session is known and again
// when it changes (a member's rooms are not a guest's), the page's link to Ergo in them, and the room the address names
// (?room=<name>), else the world's main room, else the first listed, the one whose history the link asks. The
// link lives as long as the page: leaving the world leaves Ergo. An account writes in the room through the link
// (4c); a guest reads, a room letting accounts alone speak.
import type { RoomList } from "@gnoworld/schemas";
import { Button, Sidebar, Stack } from "@gnoworld/ui";
import { lazy, Suspense, useEffect, useRef, useState } from "react";
import { useSearchParams } from "react-router";
import { pageLoginApi } from "../../lib/api/login.ts";
import { pageRoomsApi } from "../../lib/api/rooms.ts";
import { drawGuestNick } from "../../lib/ergo/ergo.ts";
import { pageErgo } from "../../lib/ergo/page.ts";
import type { AppState } from "../../store/index.ts";
import { useApp, useAppStore } from "../../storeContext.tsx";
import { chatLink } from "./link.ts";
import { LOADING } from "./Loading.tsx";
import { roomIds, roomsQuery, shownRoom } from "./names.ts";
import { RoomsView } from "./RoomsView.tsx";
import { RoomView } from "./RoomView.tsx";

// The rooms as last asked, and what came: undefined when the list could not load.
interface Asked {
  query: string;
  sections: RoomList["sections"] | undefined;
}

// The composer, an account's alone: a visitor's page never loads its code (the first screen's budget, ADR-0001 §12).
const Composer = lazy(async () => ({ default: (await import("./Composer.tsx")).Composer }));

// Under a room's lines: the composer for an account, which writes through the link; a word for a guest.
function Writer({
  session,
  room,
  onSay,
}: {
  session: AppState["login"]["session"];
  room: string;
  onSay: (draft: string) => boolean;
}) {
  if (session.kind !== "in") return <p>Log in to write in this room.</p>;
  return (
    <Suspense fallback={null}>
      <Composer key={room} room={room} nick={session.address} onSay={onSay} />
    </Suspense>
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
    <Sidebar space="l">
      <RoomsView sections={sections} current={current} />
      {current === undefined ? null : (
        <RoomView
          room={current}
          state={state}
          chat={chat}
          composer={
            <Writer session={session} room={current} onSay={(draft) => linkRef.current?.say(current, draft) ?? false} />
          }
        />
      )}
    </Sidebar>
  );
}

// A world's chat on its page (slice 4's 4b): its rooms from the server, asked once the session is known and again
// when it changes (a member's rooms are not a guest's), the page's link to Ergo in them, and the room the address names
// (?room=<name>), else the world's main room, else the first listed, the one whose history the link asks. The
// link lives as long as the page: leaving the world leaves Ergo.
import type { RoomList } from "@gnoworld/schemas";
import { Button, Sidebar, Stack } from "@gnoworld/ui";
import { useEffect, useRef, useState } from "react";
import { useSearchParams } from "react-router";
import { pageLoginApi } from "../../lib/api/login.ts";
import { pageRoomsApi } from "../../lib/api/rooms.ts";
import { drawGuestNick } from "../../lib/ergo/ergo.ts";
import { pageErgo } from "../../lib/ergo/page.ts";
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

export function ChatPanel({ world }: { world: string }) {
  const store = useAppStore();
  // The page's link to Ergo, made once the page runs: never in the build's pre-render.
  const linkRef = useRef<ReturnType<typeof chatLink>>(undefined);
  const [asked, setAsked] = useState<Asked>();
  const [attempt, setAttempt] = useState(0);
  const [params] = useSearchParams();
  const query = roomsQuery(
    world,
    useApp(({ login }) => login.session),
    attempt,
  );
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
      {current === undefined ? null : <RoomView room={current} state={state} chat={chat} />}
    </Sidebar>
  );
}

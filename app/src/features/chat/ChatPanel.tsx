// A world's chat on its page (slice 4's 4b): its rooms from the server, asked again when the session changes
// (a member's rooms are not a guest's), the page's link to Ergo in them, and the room the address names
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
import { shownRoom } from "./names.ts";
import { RoomsView } from "./RoomsView.tsx";
import { RoomView } from "./RoomView.tsx";

// The rooms as last asked: for which world, session and try, and what came.
interface Asked {
  world: string;
  session: string;
  attempt: number;
  sections: RoomList["sections"] | "failed";
}

export function ChatPanel({ world }: { world: string }) {
  const store = useAppStore();
  // The page's link to Ergo, made once the page runs: never in the build's pre-render.
  const linkRef = useRef<ReturnType<typeof chatLink>>(undefined);
  const [asked, setAsked] = useState<Asked>();
  const [attempt, setAttempt] = useState(0);
  const [params] = useSearchParams();
  // Who reads: the rooms listed are the session's.
  const session = useApp(({ login }) => (login.session.kind === "in" ? login.session.address : login.session.kind));
  useEffect(() => {
    const made = chatLink({ store, connect: pageErgo, ticket: pageLoginApi().ticket, guest: drawGuestNick });
    linkRef.current = made;
    return () => {
      made.stop();
      linkRef.current = undefined;
    };
  }, [store]);
  useEffect(() => {
    let live = true;
    pageRoomsApi()
      .rooms(world)
      .then(
        (got) => {
          if (live) setAsked({ world, session, attempt, sections: got.ok ? got.value.sections : "failed" });
        },
        () => {
          if (live) setAsked({ world, session, attempt, sections: "failed" });
        },
      );
    return () => {
      live = false;
    };
  }, [world, session, attempt]);
  const fresh = asked?.world === world && asked.session === session && asked.attempt === attempt;
  const sections = fresh ? asked.sections : undefined;
  useEffect(() => {
    if (sections !== undefined && sections !== "failed") {
      linkRef.current?.follow(sections.flatMap(({ rooms }) => rooms.map(({ room }) => room)));
    }
  }, [sections]);
  const current = Array.isArray(sections) ? shownRoom(world, sections, params.get("room")) : undefined;
  useEffect(() => {
    linkRef.current?.show(current);
  }, [current]);
  const state = useApp((app) => (current === undefined ? undefined : app.chat.rooms[current]));
  const chat = useApp((app) => app.login.chat);
  if (sections === undefined) return <p role="status">Loading the rooms…</p>;
  if (sections === "failed") {
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

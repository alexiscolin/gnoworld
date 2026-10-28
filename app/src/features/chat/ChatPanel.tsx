// A world's chat on its page (slice 4's 4b): its rooms from the server, asked once the session is known and again
// when it changes (a member's rooms are not a guest's), the page's link to Ergo in them, and the room the address names
// (?room=<name>), else the world's main room, else the first listed, the one whose history the link asks. The
// link lives as long as the page: leaving the world leaves Ergo. An account writes in the room through the link
// (4c); a guest reads, a room letting accounts alone speak.
import type { Line } from "@gnoworld/core";
import type { RoomList } from "@gnoworld/schemas";
import { Button, Stack } from "@gnoworld/ui";
import { lazy, Suspense, useEffect, useLayoutEffect, useRef, useState } from "react";
import { useSearchParams } from "react-router";
import { pageLoginApi } from "../../lib/api/login.ts";
import { pageDmPrefs } from "../../lib/dms/page.ts";
import { pageDrafts } from "../../lib/drafts/page.ts";
import { pageKeep } from "../../lib/keep/page.ts";
import { pageNoticePrefs } from "../../lib/notices/page.ts";
import { pageRoomsApi } from "../../lib/api/rooms.ts";
import { drawGuestNick } from "../../lib/ergo/ergo.ts";
import { pageErgo } from "../../lib/ergo/page.ts";
import { savesData } from "../../lib/saveData.ts";
import { useApp, useAppStore } from "../../storeContext.tsx";
import { chatLink, type ChatLink } from "./link.ts";
import { GuestLoaded } from "./GuestLoaded.tsx";
import { LOADING } from "./Loading.tsx";
import { groupRooms, roomIds, roomsQuery, shownRoom } from "./names.ts";
import { useOnHide } from "./useOnHide.ts";
import { useVerdicts } from "./useVerdicts.ts";

// An account's chat, its code asked once the session is an account's (the first screen's budget, ADR-0001 §12).
const AccountChat = lazy(async () => ({ default: (await import("./AccountChat.tsx")).AccountChat }));

// The rooms as last asked, and what came: undefined when the list could not load.
interface Asked {
  query: string;
  sections: RoomList["sections"] | undefined;
}

// What says the rooms could not load, and asks again.
function RoomsFailed({ onRetry }: { onRetry: () => void }) {
  return (
    <Stack space="s">
      <p role="alert">The rooms could not load.</p>
      <Button onClick={onRetry}>Try again</Button>
    </Stack>
  );
}

// The page's link to Ergo: the page's socket, the login's tickets, a guest's drawn nick, an account's device (its direct
// messages' choices and drafts, its saved lines and places).
const pageLink = (store: ReturnType<typeof useAppStore>) =>
  chatLink({
    store,
    connect: pageErgo,
    ticket: pageLoginApi().ticket,
    guest: drawGuestNick,
    device: (account) => ({
      prefs: pageDmPrefs(account),
      drafts: pageDrafts(account),
      notices: pageNoticePrefs(account),
    }),
    keep: pageKeep,
    // What the link does for an account alone, asked as an account connects (the first screen's budget, ADR-0001 §12).
    loadKit: async () => (await import("./accountKit.ts")).makeKit,
  });

// The rooms as the server lists them for `query`, asked again as it changes; none before the first answer.
function useRoomsAsked(world: string, query: string | undefined) {
  const [asked, setAsked] = useState<Asked>();
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
  return { loaded, sections: loaded ? asked.sections : undefined };
}

// The shown room's verdicts, which a link's player waits on, followed and asked for the reader; and whether the reader
// saves data, read once the page runs: the players and the verdicts they wait on agree, whatever it says later.
function useRoomVerdicts(
  store: ReturnType<typeof useAppStore>,
  room: string | undefined,
  lines: readonly Line[] | undefined,
) {
  const session = useApp(({ login }) => login.session);
  const [saving] = useState(savesData);
  const reader = session.kind === "in" ? session.address : undefined;
  useVerdicts(store, { room, lines, reader, saving });
  const verdicts = useApp((app) => (room === undefined ? undefined : app.verdicts[room]));
  return { saving, verdicts };
}

export function ChatPanel({ world }: { world: string }) {
  const store = useAppStore();
  // The page's link to Ergo, made once the page runs: never in the build's pre-render.
  const linkRef = useRef<ChatLink>(undefined);
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
  const { loaded, sections } = useRoomsAsked(world, query);
  useEffect(() => {
    if (sections !== undefined) linkRef.current?.follow(roomIds(sections), groupRooms(sections));
  }, [sections]);
  const current = sections === undefined ? undefined : shownRoom(world, sections, params.get("room"));
  // The page hidden: the reading places waiting their 2 s go at once (F940).
  useOnHide(() => {
    linkRef.current?.flush();
  });
  // Before the room's lines' own effects, which read it to the link: a child's effects run before its parent's (CR1).
  useLayoutEffect(() => {
    linkRef.current?.show(current);
  }, [current]);
  const state = useApp((app) => (current === undefined ? undefined : app.chat.rooms[current]));
  const { saving, verdicts } = useRoomVerdicts(store, current, state?.lines);
  const chat = useApp((app) => app.login.chat);
  const failed =
    loaded && sections === undefined ? (
      <RoomsFailed
        onRetry={() => {
          setAttempt((n) => n + 1);
        }}
      />
    ) : undefined;
  const dismissed = (room: string) => {
    store.getState().chatActions.dismissed(room);
  };
  // An account's code is asked as its rooms are, not after them: its chat says the loading itself.
  if (session.kind === "in") {
    return (
      <Suspense fallback={LOADING}>
        <AccountChat
          loaded={loaded}
          world={world}
          sections={sections}
          dm={params.get("dm")}
          current={current}
          state={state}
          verdicts={verdicts}
          saving={saving}
          chat={chat}
          session={session}
          link={linkRef}
          dismissed={dismissed}
          dmDismissed={(partner) => {
            store.getState().dmActions.dismissed(partner);
          }}
          sayTo={(partner, say, tags) => linkRef.current?.sayTo(partner, say, tags) ?? false}
          failed={failed}
        />
      </Suspense>
    );
  }
  if (!loaded) return LOADING;
  // A visitor has no direct message: the rooms that could not load are all the page says.
  if (failed !== undefined) return failed;
  return (
    <GuestLoaded
      sections={sections ?? []}
      current={current}
      state={state}
      verdicts={verdicts}
      saving={saving}
      chat={chat}
      link={linkRef}
      dismissed={dismissed}
      asksDm={params.get("dm") !== null}
    />
  );
}

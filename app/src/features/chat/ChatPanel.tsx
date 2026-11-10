// A world's chat on its page (slice 4's 4b): its rooms from the server, asked once the session is known and again
// when it changes (a member's rooms are not a guest's), the page's link to Ergo in them, and the room the address names
// (?room=<name>), else the world's main room, else the first listed, the one whose history the link asks. The
// link lives as long as the page: leaving the world leaves Ergo. An account writes in the room through the link
// (4c); a guest reads, a room letting accounts alone speak.
import type { Line } from "@gnoworld/core";
import type { RoomList } from "@gnoworld/schemas";
import { Button, Stack } from "@gnoworld/ui";
import { lazy, Suspense, useEffect, useLayoutEffect, useRef, useState, type RefObject } from "react";
import { useSearchParams } from "react-router";
import { useQuery } from "@tanstack/react-query";
import { roomsOptions } from "../../lib/query/apiReads.ts";
import { queryClient } from "../../lib/query/client.ts";
import { keys } from "../../lib/query/keys.ts";
import { savesData } from "../../lib/saveData.ts";
import { useApp, useAppStore } from "../../storeContext.tsx";
import type { ChatLink } from "./link.ts";
import { dropLink, takeLink } from "./pageLink.ts";
import { GuestLoaded } from "./GuestLoaded.tsx";
import { LOADING } from "./Loading.tsx";
import { groupRooms, roomIds, roomsQuery } from "./names.ts";
import type { ChatPlace } from "./ChatScreen.tsx";
import { watchRoomsChanged } from "./roomsListed.ts";
import { useDrawn } from "./useDrawn.ts";
import { useOnHide } from "./useOnHide.ts";
import { useVerdicts } from "./useVerdicts.ts";

// An account's chat, its code asked once the session is an account's (the first screen's budget, ADR-0001 §12).
const AccountChat = lazy(async () => ({ default: (await import("./AccountChat.tsx")).AccountChat }));

// What says the rooms could not load, and asks again.
function RoomsFailed({ onRetry }: { onRetry: () => void }) {
  return (
    <Stack space="s">
      <p role="alert">The rooms could not load.</p>
      <Button onClick={onRetry}>Try again</Button>
    </Stack>
  );
}

// The rooms as the server lists them for `query`, asked again as it changes; none before the first answer. A world listed before shows its rooms at
// once, the new list replacing them when it comes; a fresh list that failed leaves the one shown (roomsListed.ts).
function useRoomsAsked(store: ReturnType<typeof useAppStore>, world: string, query: string | undefined) {
  const { data, isError } = useQuery(
    { ...roomsOptions(world, query ?? ""), enabled: query !== undefined },
    queryClient,
  );
  // A room made on the page: the list is asked again behind the one shown, which stays until the new one comes.
  useEffect(
    () =>
      watchRoomsChanged(() => {
        if (query !== undefined)
          queryClient.invalidateQueries({ queryKey: keys.rooms(query) }).catch((error: unknown) => {
            reportError(error);
          });
      }),
    [query],
  );
  const sections = data?.sections;
  useEffect(() => {
    if (query !== undefined && (sections !== undefined || isError)) store.getState().chatActions.listed(sections);
  }, [store, query, sections, isError]);
  return { loaded: sections !== undefined || (query !== undefined && isError), sections };
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

// The link told the rooms to follow and the room in view.
function useLinkAt(
  linkRef: RefObject<ChatLink | undefined>,
  sections: RoomList["sections"] | undefined,
  current: string | undefined,
) {
  useEffect(() => {
    if (sections !== undefined) linkRef.current?.follow(roomIds(sections), groupRooms(sections));
  }, [linkRef, sections]);
  // Before the room's lines' own effects, which read it to the link: a child's effects run before its parent's (CR1).
  useLayoutEffect(() => {
    linkRef.current?.show(current);
  }, [linkRef, current]);
}

export function ChatPanel({ world, place, room }: { world: string; place: ChatPlace; room?: string | undefined }) {
  const store = useAppStore();
  // The page's link to Ergo, made once the page runs: never in the build's pre-render.
  const linkRef = useRef<ChatLink>(undefined);
  const [attempt, setAttempt] = useState(0);
  const [params] = useSearchParams();
  const session = useApp(({ login }) => login.session);
  const query = roomsQuery(world, session, attempt);
  useEffect(() => {
    linkRef.current = takeLink(store);
    return dropLink;
  }, [store]);
  const asked = useRoomsAsked(store, world, query);
  const { shown, loaded } = useDrawn(asked, { world, place, room: room ?? params.get("room") });
  const { sections, current } = shown;
  // The page hidden: the reading places waiting their 2 s go at once (F940).
  useOnHide(() => {
    linkRef.current?.flush();
  });
  useLinkAt(linkRef, sections, current);
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
          world={shown.world}
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
          place={shown.place}
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
      place={shown.place}
    />
  );
}

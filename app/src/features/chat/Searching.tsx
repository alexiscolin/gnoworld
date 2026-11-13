// The chat's search on the chat's screen (slice 13, C): the header's button, the chords, the panel in the info panel's place, and the band over
// a room read around a found message. Only this file is on the first screen; the panel, the field's logic and the band are one late chunk,
// asked when the search is first opened (a room never searched loads none of it).
import type { RoomList, SearchHit } from "@gnoworld/schemas";
import { EmptyState } from "@gnoworld/ui";
import { useEffect, useEffectEvent, useRef, useState, type RefObject } from "react";
import { useNavigate, useSearchParams } from "react-router";
import { useApp, useAppStore } from "../../storeContext.tsx";
import { chunked } from "./Failing.tsx";
import type { ChatLink } from "./linkTypes.ts";
import { roomHref, roomWorld } from "./names.ts";
import type { Act } from "./PlaceActs.tsx";
import type { Time } from "./search/filters.ts";
import { opensChatSearch } from "./searchKeys.ts";

const Panel = chunked(async () => ({ default: (await import("./search/ChatSearch.tsx")).ChatSearch }), {
  waiting: null,
  failed: <EmptyState look="failed" line="The search could not load." />,
});
const Banner = chunked(async () => ({ default: (await import("./search/JumpBanner.tsx")).default }), {
  waiting: null,
  failed: null,
});

type Store = ReturnType<typeof useAppStore>;
type LinkRef = RefObject<ChatLink | undefined>;

// The jump's code is the search's late chunk, asked as a result is opened or a room read around a message is left.
async function openFound(store: Store, link: LinkRef, hit: SearchHit): Promise<boolean> {
  const { jumpingOf } = await import("./search/jumping.ts");
  return link.current !== undefined && jumpingOf(store, link.current).around(hit.room, hit.msgid);
}

function leaveJump(store: Store, link: LinkRef, room: string): void {
  import("./search/jumping.ts").then(({ jumpingOf }) => {
    if (link.current !== undefined) jumpingOf(store, link.current).latest(room);
  }, reportError);
}

// Out of the component: the compiler draws no dynamic import inside one.
function awayFrom(store: Store, link: LinkRef, room: string | undefined): void {
  import("./search/jumping.ts").then(({ jumpingOf }) => {
    if (link.current !== undefined) jumpingOf(store, link.current).away(room);
  }, reportError);
}

/** The address's key for words handed to the search (the palette's last row). */
const FIND = "find";

/** What the search knows of the conversation in view. */
export interface SearchInput {
  /** The room in view; none for a direct message. */
  room: string | undefined;
  sections: RoomList["sections"];
  members: readonly string[];
  me: string | undefined;
  link: RefObject<ChatLink | undefined>;
}

// Rooms an index holds: never a members room (server/src/rooms/types.ts's `searchable`).
const SEARCHED = new Set(["open", "announcement", "accounts"]);

// The words the address hands over (the palette's last row), taken once and left out of the address.
function useHanded(text: string | undefined, setText: (text: string) => void) {
  const [params, setParams] = useSearchParams();
  const handed = params.get(FIND);
  if (handed !== null && text === undefined) setText(handed);
  useEffect(() => {
    if (handed === null) return;
    const rest = new URLSearchParams(params);
    rest.delete(FIND);
    setParams(rest, { replace: true });
  }, [handed, params, setParams]);
}

// The chords, read before the page's own so the palette's slash is left out: the chat's search is the one asked for.
function useChords(full: boolean, open: () => void) {
  const asked = useEffectEvent((event: KeyboardEvent) => {
    if (!opensChatSearch(event, full) || document.querySelector("dialog[open]") !== null) return;
    event.preventDefault();
    event.stopPropagation();
    open();
  });
  useEffect(() => {
    const leaving = new AbortController();
    document.addEventListener("keydown", asked, { signal: leaving.signal, capture: true });
    return () => {
      leaving.abort();
    };
  }, []);
}

export function useSearching(
  { room, sections, members, me, link }: SearchInput,
  at: { world: { slug: string; name: string }; full: boolean; compact: boolean; closeThread: (() => void) | undefined },
) {
  const { world, full, compact, closeThread } = at;
  const navigate = useNavigate();
  const [text, setText] = useState<string>();
  const [time, setTime] = useState<Time>("any");
  useHanded(text, setText);
  const openerRef = useRef<HTMLElement>(null);
  const open = () => {
    openerRef.current = document.activeElement instanceof HTMLElement ? document.activeElement : null;
    closeThread?.();
    setText((now) => now ?? "");
  };
  useChords(full, open);
  const jump = useApp((app) => (room === undefined ? undefined : app.chat.rooms[room]?.jump));
  const type = sections.flatMap((section) => section.rooms).find((each) => each.room === room)?.type;
  const rooms = sections.flatMap((section) => section.rooms).filter((each) => SEARCHED.has(each.type));
  const store = useAppStore();
  // A room left while read around a message is read at its newest again.
  useEffect(
    () => () => {
      if (store.getState().chat.rooms[room ?? ""]?.jump === undefined) return;
      leaveJump(store, link, room ?? "");
    },
    [store, link, room],
  );
  // Whether a jump was asked here: only then is the jump's chunk asked for when the room in view changes.
  const jumpedRef = useRef(false);
  useEffect(() => {
    if (jumpedRef.current) awayFrom(store, link, room);
  }, [store, link, room]);
  const found = (hit: SearchHit) => {
    jumpedRef.current = true;
    openFound(store, link, hit).then((opened) => {
      if (!opened) return;
      const to = hit.room === room ? undefined : roomHref(hit.room, full);
      if (to !== undefined) Promise.resolve(navigate(to)).catch(reportError);
      // A phone's panel is the screen: the room takes it back.
      if (compact) setText(undefined);
    }, reportError);
  };
  return {
    act: { label: "Search messages", icon: "search-messages", onSelect: open } satisfies Act,
    panel:
      text === undefined ? undefined : (
        <Panel
          text={text}
          onText={setText}
          time={time}
          onTime={setTime}
          world={{ slug: room === undefined ? world.slug : roomWorld(room), name: world.name }}
          who={{ me, members, rooms: rooms.map((each) => each.room) }}
          room={room}
          searched={room !== undefined && (type === undefined || SEARCHED.has(type))}
          open={jump}
          onOpen={found}
          onClose={() => {
            setText(undefined);
            // Back where the search was asked from, else on its button, or on More where the header holds it in its menu (PlaceActs.tsx).
            requestAnimationFrame(() => {
              const back =
                openerRef.current?.isConnected === true && openerRef.current !== document.body
                  ? openerRef.current
                  : null;
              (
                back ??
                document.querySelector<HTMLElement>(
                  "[data-chat-screen] :is(button[aria-label='Search messages'], button[aria-label='More'])",
                )
              )?.focus();
            });
          }}
        />
      ),
    banner: room !== undefined && jump !== undefined ? <Banner key={room} room={room} id={jump} link={link} /> : null,
  };
}

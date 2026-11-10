// The chat's screen on a world's page, whoever reads it (a visitor's or an account's): docked at the right of the page
// (frames 20 to 35) or, expanded, full bleed over it (frames 56 to 77): the header over the column of worlds, the rooms, the
// conversation and the info panel (ui's ChatLayout places them by the box's width; this fills them). The rooms and the room in view are the caller's.
import { ChatLayout } from "@gnoworld/ui";
import type { Line } from "@gnoworld/core";
import { useEffect, useRef, type ReactElement, type ReactNode, type SyntheticEvent } from "react";
import { useNavigate, useSearchParams } from "react-router";
import { ChatHeader, type ChatHeaderProps } from "./ChatHeader.tsx";
import { PlaceButtons } from "./PlaceButtons.tsx";
import { usePeople } from "./usePeople.tsx";
import { useColumns } from "./columns.ts";
import { chunked } from "./Failing.tsx";
import { asksFull, FullProvider, useFull, useFullMark } from "./full.ts";
import { useFullMove } from "./fullMove.ts";
import { keyOf } from "./stillScreen.ts";
import { useSwapMove } from "./swapMove.ts";
import { FullButton } from "./FullButton.tsx";
import { warmPictures } from "./ColumnPlanet.tsx";
import { Info } from "./Info.tsx";
import type { Pinned } from "./QuickActions.tsx";
import type { UniverseView } from "../../places.ts";
import { worldsFollowedIn } from "../follow/index.ts";
import { useApp } from "../../storeContext.tsx";
import type { ChatWorld } from "./place.ts";
import { useCompact } from "./useCompact.ts";
import { useMedia } from "./useMedia.ts";
import type { useThreads } from "./Threading.tsx";
import { Worlds } from "./Worlds.tsx";
import styles from "./ChatScreen.module.css";

// The rooms of a narrow chat (a dock's, a phone's) sit behind a control and a drawer, whose code is asked once the box is
// narrow: a wide one never carries it (the first screen's budget, ADR-0001 §12). A chunk that cannot be fetched leaves the
// control's place with a word, never the page (F1763).
const NARROW = 900;
const RoomsDrawer = chunked(async () => ({ default: (await import("./RoomsDrawer.tsx")).RoomsDrawer }), {
  waiting: null,
  failed: <p role="status">The rooms could not load.</p>,
});

/** The place a chat is in: what the page knows of its world and of the worlds beside it. */
export interface ChatPlace {
  slug: string;
  name: string;
  description: string;
  /** Above the info panel's name: where the world is. */
  kicker: string;
  /** Where closing the chat goes: the universe's home. */
  home: string;
  /** What closing does instead, where the chat stands over the page it closes back to (the dock over the cosmos, frame 143). */
  close?: (() => void) | undefined;
  /** The universe's worlds, in order. */
  worlds: readonly ChatWorld[];
  /** Under the dock's width the chat stays a block of the page, and never takes it: the Earth's globe is what its page shows. */
  inPage?: boolean | undefined;
  /** The Earth's general chat, whose pills are its own (QuickActions.tsx). */
  earth?: boolean | undefined;
  /** The world's realms on the chain (`gno.land/r/gov/dao`), and its universe: Realm opens the first's view, the panel links it on
   * gnoweb. */
  realms?: readonly string[] | undefined;
  /** The realm this place is the page of: the panel links it on gnoweb, and its pills stay a hub's. */
  realm?: string | undefined;
  universe: Pick<UniverseView, "id" | "isDefault" | "gnoweb">;
  /** The calls the world's team pins (D271): their pills in the quick actions, and the cards they open over them. */
  pinned?: Pinned | undefined;
}

/** What the dock draws and the full chat does not (it has its column, a phone its drawer). */
function Docked({ children }: { children: ReactNode }) {
  return useFull() ? null : children;
}

export interface ChatScreenProps {
  place: ChatPlace;
  /** The room's name, or a direct message's partner: the place's own name when none is in view. */
  title: ReactNode;
  /** What the name opens, and the mark after it (ChatHeader's). */
  menu?: ChatHeaderProps["menu"];
  mark?: ChatHeaderProps["mark"];
  /** The rooms as chips under the header, drawn in the dock only: the full chat has its column, a phone its drawer. */
  chips?: ReactNode;
  /** The rooms' column; on a phone it sits behind the header's control instead. */
  rail: ReactElement;
  /** What the account has not seen in the rooms, on that control. */
  unread: number;
  /** How many wrote here in the last 15 minutes, in the panel; none draws no figure. */
  talking?: number | undefined;
  /** How many have the room open, said in the narrow chat's Who's here dialog. */
  present?: number | undefined;
  /** The room's lines and who is here: the countries they declared, counted in the panel. */
  here?: { lines: readonly Line[]; members: readonly string[] } | undefined;
  /** Who is here, drawn under Here now. */
  people: ReactNode;
  /** What the room's thread adds: its panel, which takes the info panel's place while one is open. */
  threads: Pick<ReturnType<typeof useThreads>, "view" | "aside" | "close">;
  /** What is said under the screen, apart from the layout (a notice's status). */
  status?: ReactNode;
  /** The conversation, given what opens the people (`ask`): the info panel, or on a phone a dialog. */
  children: ReactNode;
}

// The window where the chat has a dock beside the scene (ui's Panel.Layout): under it the chat is the page, as a phone's.
const DOCKABLE = "(min-width: 1280px)";

// What a thread open puts in the info panel's place: its panel; none while no thread is open.
const threadAside = (threads: ChatScreenProps["threads"]) =>
  "threaded" in threads.view && threads.view.threaded ? <>{threads.aside}</> : undefined;

// Under the dock's width the chat takes the page, unless the place keeps it a block of its own.
const takesPage = (dockable: boolean, { inPage }: ChatPlace) => !dockable && inPage !== true;

// Whether the planet's bar holds the place's buttons: the info panel shows (wide, full, no thread over it).
const inPlaceView = (full: boolean, compact: boolean, thread: ReactNode): boolean =>
  full && !compact && thread === undefined;

// What closes the full chat: none where the page is the chat and would open it again.
const closeFull = (dockable: boolean, place: ChatPlace) => (takesPage(dockable, place) ? null : <FullButton full />);

// Closing goes where the place says, the universe's home by default.
function closeChat(place: ChatPlace, navigate: ReturnType<typeof useNavigate>) {
  if (place.close === undefined) Promise.resolve(navigate(place.home)).catch(reportError);
  else place.close();
}

// The screen's fade-in (ChatScreen.module.css) is its first draw's: a screen taken to another page's dock (fullHost.tsx) is drawn again by
// the browser, and its fade would play once more over the room it holds.
function arrived({ currentTarget, target }: SyntheticEvent<HTMLElement>) {
  if (currentTarget !== target) return;
  currentTarget.style.animation = "none";
  currentTarget.style.transition = "none";
}

export function ChatScreen(props: ChatScreenProps) {
  const { place, title, chips, menu, mark, rail, unread, talking, present, here: room, people, threads } = props;
  const { status, children } = props;
  const dockable = useMedia(DOCKABLE);
  const [params] = useSearchParams();
  const full = takesPage(dockable, place) || asksFull(params);
  useFullMark(full);
  const screenRef = useRef<HTMLDivElement>(null);
  useFullMove(screenRef, full);
  useSwapMove(screenRef, keyOf(place));
  useEffect(() => {
    warmPictures(place.worlds);
  }, [place.worlds]);
  const compact = useCompact(screenRef, NARROW, full);
  const navigate = useNavigate();
  const follows = useApp((state) => state.device.follows);
  const followed = worldsFollowedIn(follows, place.universe.id);
  const columns = useColumns();
  const here = usePeople({ screenRef, people, compact, present, closeThread: threads.close });
  const thread = threadAside(threads);
  // The place's buttons stand in the planet's bar where the info panel shows, else in the header.
  const buttons = <PlaceButtons world={place.slug} onWhoIsHere={here.ask} />;
  return (
    <FullProvider value={full}>
      <div
        ref={screenRef}
        className={styles["screen"]}
        data-chat-screen=""
        onAnimationEnd={arrived}
        onTransitionEnd={arrived}
        data-full={full ? "" : undefined}
        data-compact={compact ? "" : undefined}
      >
        <ChatLayout
          {...columns}
          header={
            <ChatHeader
              world={place.name}
              buttons={inPlaceView(full, compact, thread) ? undefined : buttons}
              title={title}
              menu={menu}
              mark={mark}
              rooms={compact && full ? <RoomsDrawer unread={unread} rail={rail} /> : undefined}
              docked={dockable}
              onClose={() => {
                closeChat(place, navigate);
              }}
            />
          }
          worlds={<Worlds worlds={place.worlds} current={place.slug} followed={followed} universe={place.universe} />}
          rooms={compact ? undefined : <div className={styles["rail"]}>{rail}</div>}
          info={
            thread ??
            (compact ? undefined : (
              <Info
                place={place}
                talking={talking}
                room={room}
                people={people}
                panelRef={here.panel}
                buttons={buttons}
                close={closeFull(dockable, place)}
              />
            ))
          }
          infoFirst={thread !== undefined}
        >
          <Docked>{chips}</Docked>
          {children}
        </ChatLayout>
      </div>
      {here.dialog}
      {status}
    </FullProvider>
  );
}

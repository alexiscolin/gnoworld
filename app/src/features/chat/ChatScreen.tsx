// The chat's screen on a world's page, whoever reads it (a visitor's or an account's): docked at the right of the page
// (frames 20 to 35) or, expanded, full bleed over it (frames 56 to 77): the header over the column of worlds, the rooms, the
// conversation and the info panel (ui's ChatLayout places them by the box's width; this fills them). The rooms and the room in view are the caller's.
import { ChatLayout, Dialog } from "@gnoworld/ui";
import type { Line } from "@gnoworld/core";
import { useRef, useState, type ReactElement, type ReactNode, type RefObject } from "react";
import { useLocation, useNavigate, useSearchParams } from "react-router";
import { ChatHeader, type ChatHeaderProps } from "./ChatHeader.tsx";
import { chunked } from "./Failing.tsx";
import { asksFull, FullProvider, useFull, withFull } from "./full.ts";
import { Info } from "./Info.tsx";
import type { Pinned } from "./QuickActions.tsx";
import type { UniverseView } from "../../places.ts";
import { worldsFollowedIn } from "../follow/index.ts";
import { useApp } from "../../storeContext.tsx";
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
  /** Above the room's name and above the panel's: where the world is. */
  kicker: string;
  /** Where closing the chat goes: the universe's home. */
  home: string;
  /** What closing does instead, where the chat stands over the page it closes back to (the dock over the cosmos, frame 143). */
  close?: (() => void) | undefined;
  /** The universe's worlds, in order. */
  worlds: readonly { slug: string; name: string; href: string; realms?: readonly string[] | undefined }[];
  /** Under the dock's width the chat stays a block of the page, and never takes it: the Earth's globe is what its page shows. */
  inPage?: boolean | undefined;
  /** The Earth's general chat, whose pills are its own (QuickActions.tsx). */
  earth?: boolean | undefined;
  /** The world's realms on the chain (`gno.land/r/gov/dao`), and its universe: Realm opens the first's view, the panel links it on
   * gnoweb. */
  realms?: readonly string[] | undefined;
  universe: Pick<UniverseView, "id" | "isDefault" | "gnoweb">;
  /** The calls the world's team pins (D271): their pills in the quick actions, and the cards they open over them. */
  pinned?: Pinned | undefined;
}

/** What Who's here does: where the chat has an info panel it takes the reader to the people in it, closing the thread that
 * holds its place; in a narrow chat, which has no panel, it opens them in a dialog, which an address change closes. Their
 * list is the caller's (`people`). */
function usePeople({
  screenRef,
  people,
  compact,
  talking,
  closeThread,
}: {
  screenRef: RefObject<HTMLElement | null>;
  people: ReactNode;
  compact: boolean;
  talking: number | undefined;
  closeThread: (() => void) | undefined;
}) {
  const panelRef = useRef<HTMLElement>(null);
  // Open at an address: a move to another closes it, as the room behind it changes.
  const { key } = useLocation();
  const [opened, setOpened] = useState<string>();
  return {
    panel: panelRef,
    ask: () => {
      if (compact) {
        setOpened(key);
        return;
      }
      closeThread?.();
      // After the thread's panel is gone and the line has had the focus back, which the people take from it.
      requestAnimationFrame(() => {
        requestAnimationFrame(() => {
          panelRef.current?.focus();
        });
      });
    },
    dialog: compact ? (
      <Dialog
        title="Who's here"
        {...(talking === undefined ? {} : { description: `${String(talking)} here now` })}
        open={opened === key}
        onClose={() => {
          setOpened(undefined);
        }}
      >
        {/* A person chosen opens a conversation, whose field the browser cannot focus while this modal holds the page: it takes
            the focus once the dialog has closed (U12). */}
        <div
          onClick={(event) => {
            if (!(event.target instanceof Element) || event.target.closest("button") === null) return;
            setOpened(undefined);
            requestAnimationFrame(() => {
              requestAnimationFrame(() => {
                screenRef.current?.querySelector<HTMLElement>('[data-region="conversation"] textarea')?.focus();
              });
            });
          }}
        >
          {opened === key ? people : null}
        </div>
      </Dialog>
    ) : null,
  };
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
  /** The header's kicker when it is not the place's: a direct message's "Direct message". */
  kicker?: string | undefined;
  /** The rooms as chips under the header, drawn in the dock only: the full chat has its column, a phone its drawer. */
  chips?: ReactNode;
  /** The rooms' column; on a phone it sits behind the header's control instead. */
  rail: ReactElement;
  /** What the account has not seen in the rooms, on that control. */
  unread: number;
  /** How many are talking here now, in the panel; none draws no figure. */
  talking?: number | undefined;
  /** The room's lines and who is here: the countries they declared, counted in the panel. */
  here?: { lines: readonly Line[]; members: readonly string[] } | undefined;
  /** Who is here, drawn under Here now. */
  people: ReactNode;
  /** What the room's thread adds: its panel, which takes the info panel's place while one is open. */
  threads: Pick<ReturnType<typeof useThreads>, "view" | "aside" | "close">;
  /** What is said under the screen, apart from the layout (a notice's status). */
  status?: ReactNode;
  /** The conversation, given what opens the people (`ask`): the info panel, or on a phone a dialog. */
  children: (ask: () => void) => ReactNode;
}

// The window where the chat has a dock beside the scene (ui's Panel.Layout): under it the chat is the page, as a phone's.
const DOCKABLE = "(min-width: 1280px)";

// What a thread open puts in the info panel's place: its panel; none while no thread is open.
const threadAside = (threads: ChatScreenProps["threads"]) =>
  "threaded" in threads.view && threads.view.threaded ? <>{threads.aside}</> : undefined;

// Under the dock's width the chat takes the page, unless the place keeps it a block of its own.
const takesPage = (dockable: boolean, { inPage }: ChatPlace) => !dockable && inPage !== true;

export function ChatScreen(props: ChatScreenProps) {
  const { place, title, kicker, chips, menu, mark, rail, unread, talking, here: room, people, threads } = props;
  const { status, children } = props;
  const dockable = useMedia(DOCKABLE);
  const [params, setParams] = useSearchParams();
  const full = takesPage(dockable, place) || asksFull(params);
  const screenRef = useRef<HTMLDivElement>(null);
  const compact = useCompact(screenRef, NARROW);
  const navigate = useNavigate();
  const follows = useApp((state) => state.device.follows);
  const followed = worldsFollowedIn(follows, place.universe.id);
  const here = usePeople({ screenRef, people, compact, talking, closeThread: threads.close });
  const thread = threadAside(threads);
  return (
    <FullProvider value={full}>
      <div
        ref={screenRef}
        className={styles["screen"]}
        data-full={full ? "" : undefined}
        data-compact={compact ? "" : undefined}
      >
        <ChatLayout
          header={
            <ChatHeader
              kicker={kicker ?? place.kicker}
              title={title}
              menu={menu}
              mark={mark}
              rooms={compact ? <RoomsDrawer unread={unread} rail={rail} /> : undefined}
              size={
                dockable
                  ? {
                      full,
                      onToggle: () => {
                        setParams(withFull(params, !full));
                      },
                    }
                  : undefined
              }
              onClose={() => {
                if (place.close === undefined) Promise.resolve(navigate(place.home)).catch(reportError);
                else place.close();
              }}
            />
          }
          worlds={<Worlds worlds={place.worlds} current={place.slug} followed={followed} />}
          rooms={compact ? undefined : <div className={styles["rail"]}>{rail}</div>}
          info={
            thread ??
            (compact ? undefined : (
              <Info place={place} talking={talking} room={room} people={people} panelRef={here.panel} />
            ))
          }
          infoFirst={thread !== undefined}
        >
          <Docked>{chips}</Docked>
          {children(here.ask)}
        </ChatLayout>
      </div>
      {here.dialog}
      {status}
    </FullProvider>
  );
}

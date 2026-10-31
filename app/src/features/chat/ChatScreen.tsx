// The chat's screen on a world's page, whoever reads it (a visitor's or an account's): the video's frame 23.58.01, the
// header over the column of worlds, the rooms, the conversation and the info panel (ui's ChatLayout places them; this
// fills them). The rooms and the room in view are the caller's.
import { ChatLayout, Dialog } from "@gnoworld/ui";
import { lazy, Suspense, useRef, useState, type ReactElement, type ReactNode } from "react";
import { useNavigate } from "react-router";
import { ChatHeader, type ChatHeaderProps } from "./ChatHeader.tsx";
import { PlaceInfo } from "./PlaceInfo.tsx";
import { QuickActions } from "./QuickActions.tsx";
import { useMedia } from "./useMedia.ts";
import type { useThreads } from "./Threading.tsx";
import { Worlds } from "./Worlds.tsx";
import styles from "./ChatScreen.module.css";

// The rooms on a phone sit behind a control and a drawer, whose code is asked once the screen is a phone's: a wider screen
// never carries it (the first screen's budget, ADR-0001 §12).
const PHONE = "(max-width: 900px)";
const LazyDrawer = lazy(async () => ({ default: (await import("./RoomsDrawer.tsx")).RoomsDrawer }));
function RoomsDrawer(props: { unread: number; rail: ReactElement }) {
  return (
    <Suspense fallback={null}>
      <LazyDrawer {...props} />
    </Suspense>
  );
}

/** The place a chat is in: what the page knows of its world and of the worlds beside it. */
export interface ChatPlace {
  slug: string;
  name: string;
  description: string;
  /** Above the room's name and above the panel's: where the world is. */
  kicker: string;
  /** Where closing the chat goes: the universe's home, until slice 7's dock gives it a scene to shrink to. */
  home: string;
  /** The universe's worlds, in order, each with the picture its column shows. */
  worlds: readonly { slug: string; name: string; href: string; src: string }[];
}

/** What Who's here does: on a wide screen it takes the reader to the people in the info panel, on a phone's, which has no
 * panel, it opens them in a dialog. Their list is the caller's (`people`). */
function usePeople(people: ReactNode, phone: boolean) {
  const panelRef = useRef<HTMLElement>(null);
  const [open, setOpen] = useState(false);
  return {
    panel: panelRef,
    ask: () => {
      if (phone) setOpen(true);
      else panelRef.current?.focus();
    },
    dialog: phone ? (
      <Dialog
        title="Who's here"
        open={open}
        onClose={() => {
          setOpen(false);
        }}
      >
        {people}
      </Dialog>
    ) : null,
  };
}

/** What goes under a room's lines: the quick actions over what writes (the composer, or a visitor's word). */
export function Dock({ onWhoIsHere, children }: { onWhoIsHere: () => void; children: ReactNode }) {
  return (
    <div className={styles["dock"]}>
      <QuickActions onWhoIsHere={onWhoIsHere} />
      {children}
    </div>
  );
}

export interface ChatScreenProps {
  place: ChatPlace;
  /** The room's name, or a direct message's partner: the place's own name when none is in view. */
  title: ReactNode;
  /** What the name opens, and the mark after it (ChatHeader's). */
  menu?: ChatHeaderProps["menu"];
  mark?: ChatHeaderProps["mark"];
  /** The rooms' column; on a phone it sits behind the header's control instead. */
  rail: ReactElement;
  /** What the account has not seen in the rooms, on that control. */
  unread: number;
  /** How many are talking here now, in the panel; none draws no figure. */
  talking?: number | undefined;
  /** Who is here, drawn under Here now. */
  people: ReactNode;
  /** What the room's thread adds: its panel, which takes the info panel's place while one is open. */
  threads: Pick<ReturnType<typeof useThreads>, "view" | "aside">;
  /** What is said under the screen, apart from the layout (a notice's status). */
  status?: ReactNode;
  /** The conversation, given what opens the people (`ask`): the info panel, or on a phone a dialog. */
  children: (ask: () => void) => ReactNode;
}

export function ChatScreen({
  place,
  title,
  menu,
  mark,
  rail,
  unread,
  talking,
  people,
  threads,
  status,
  children,
}: ChatScreenProps) {
  const phone = useMedia(PHONE);
  const navigate = useNavigate();
  const here = usePeople(people, phone);
  const thread = "threaded" in threads.view && threads.view.threaded ? <>{threads.aside}</> : undefined;
  return (
    <>
      <div className={styles["screen"]}>
        <ChatLayout
          header={
            <ChatHeader
              kicker={place.kicker}
              title={title}
              menu={menu}
              mark={mark}
              rooms={phone ? <RoomsDrawer unread={unread} rail={rail} /> : undefined}
              onClose={() => {
                Promise.resolve(navigate(place.home)).catch(reportError);
              }}
            />
          }
          worlds={<Worlds worlds={place.worlds} current={place.slug} />}
          rooms={phone ? undefined : <div className={styles["rail"]}>{rail}</div>}
          info={
            thread ?? (
              <PlaceInfo
                kicker={place.kicker}
                name={place.name}
                description={place.description}
                talking={talking}
                here={people}
                panelRef={here.panel}
              />
            )
          }
          infoFirst={thread !== undefined}
        >
          {children(here.ask)}
        </ChatLayout>
      </div>
      {here.dialog}
      {status}
    </>
  );
}

// The chat's screen on a world's page, whoever reads it (a visitor's or an account's): the video's frame 23.58.01, the
// header over the column of worlds, the rooms, the conversation and the info panel (ui's ChatLayout places them; this
// fills them). The rooms and the room in view are the caller's.
import { ChatLayout, Dialog } from "@gnoworld/ui";
import { useRef, useState, type ReactElement, type ReactNode } from "react";
import { ChatHeader } from "./ChatHeader.tsx";
import { PlaceInfo } from "./PlaceInfo.tsx";
import { QuickActions } from "./QuickActions.tsx";
import { useRoomsDrawer } from "./RoomsDrawer.tsx";
import type { useThreads } from "./Threading.tsx";
import { Worlds } from "./Worlds.tsx";
import styles from "./ChatScreen.module.css";

/** The place a chat is in: what the page knows of its world and of the worlds beside it. */
export interface ChatPlace {
  slug: string;
  name: string;
  description: string;
  /** Above the room's name and above the panel's: where the world is. */
  kicker: string;
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
  /** The rooms' column; on a phone it sits behind the header's control instead. */
  rail: ReactElement;
  /** What the account has not seen in the rooms, on that control. */
  unread: number;
  /** Who is here, drawn under Here now. */
  people: ReactNode;
  /** What the room's thread adds: its panel, which takes the info panel's place while one is open. */
  threads: Pick<ReturnType<typeof useThreads>, "view" | "aside">;
  /** What is said under the screen, apart from the layout (a notice's status). */
  status?: ReactNode;
  /** The conversation, given what opens the people (`ask`): the info panel, or on a phone a dialog. */
  children: (ask: () => void) => ReactNode;
}

export function ChatScreen({ place, title, rail, unread, people, threads, status, children }: ChatScreenProps) {
  const rooms = useRoomsDrawer(unread, rail);
  const here = usePeople(people, rooms.phone);
  const thread = "threaded" in threads.view && threads.view.threaded ? <>{threads.aside}</> : undefined;
  return (
    <>
      <div className={styles["screen"]}>
        <ChatLayout
          header={<ChatHeader kicker={place.kicker} title={title} rooms={rooms.control} />}
          worlds={<Worlds worlds={place.worlds} current={place.slug} />}
          rooms={rooms.phone ? undefined : <div className={styles["rail"]}>{rail}</div>}
          info={
            thread ?? (
              <PlaceInfo
                kicker={place.kicker}
                name={place.name}
                description={place.description}
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
      {rooms.drawer}
    </>
  );
}

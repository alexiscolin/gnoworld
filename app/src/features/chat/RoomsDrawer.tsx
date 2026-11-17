// The rooms on a phone: from 900 px down (the design system's one breakpoint, ChatScreen's) the room list and the
// direct messages sit behind one control in the chat's header, a drawer built on ui's Dialog (its focus trap, Escape,
// and the focus given back to the control). The control says the unseen count in its name while the drawer is closed.
import { Button, Chip, Dialog, Disclosure, IconButton } from "@gnoworld/ui";
import { useEffect, useState, type MouseEvent, type ReactNode } from "react";
import { useLocation } from "react-router";
import { onAsked } from "../../pageAsks.ts";
import { Folding } from "./Folding.tsx";
import { WorldRows } from "./WorldRows.tsx";
import type { WorldsProps } from "./Worlds.tsx";
import { countWords } from "./unread.ts";
import styles from "./RoomsDrawer.module.css";

// A link followed leaves the drawer, the room in view's own too, whose address does not change.
const leave = (close: () => void) => (event: MouseEvent) => {
  if (event.target instanceof Element && event.target.closest("a") !== null) close();
};

interface Body {
  rail: ReactNode;
  /** The worlds, listed under the rooms of a phone's drawer on a short window (WorldRows.tsx, whose code comes with the drawer's). */
  worlds?: WorldsProps | undefined;
  modes?: ReactNode;
}

// The rooms' row of the band asks for the rooms ("+N"); a computer's compact chat answers with its header's name menu, a phone's has no such name.
function useRoomsAsked(phone: boolean, key: string, open: (at: string) => void) {
  useEffect(() => {
    if (!phone) return;
    const stop = new AbortController();
    onAsked(
      "rooms",
      () => {
        open(key);
      },
      stop.signal,
    );
    return () => {
      stop.abort();
    };
  }, [phone, key, open]);
}

// The control: a phone's `#` in the band's row, a computer's compact chat's small button with its word.
function Control({ unread, phone, onOpen }: { unread: number; phone: boolean; onOpen: () => void }) {
  if (phone)
    return (
      <IconButton
        icon="hash"
        label="Rooms"
        size="s"
        emphasis="plain"
        count={unread}
        countNoun="unread"
        countTone="new"
        onClick={onOpen}
      />
    );
  return (
    <div>
      <Button icon="menu" emphasis="quiet" size="s" onClick={onOpen}>
        {unread > 0 ? (
          <>
            {/* Named once, "Rooms, 3 unread", by the hidden words: the count follows as a mark. */}
            <span aria-hidden="true">Rooms</span>
            <span className="visually-hidden">{`Rooms, ${countWords(unread)} unread`}</span>
            <span aria-hidden="true">
              <Chip tone="new">{countWords(unread)}</Chip>
            </span>
          </>
        ) : (
          <span>Rooms</span>
        )}
      </Button>
    </div>
  );
}

// A phone's drawer: its own title beside Close, then the modes, the rooms and the worlds, scrolling under it.
function PhoneBody({ rail, worlds, modes, close }: Body & { close: () => void }) {
  return (
    <div className={styles["drawer"]}>
      {/* The dialog's own title is for assistive technology alone in a drawer: this one is the sighted reader's, beside Close. */}
      <p className={styles["title"]} aria-hidden="true">
        Rooms
      </p>
      <div className={styles["body"]} data-drawer-body="" onClick={leave(close)}>
        {modes === undefined ? null : (
          <Disclosure look="section" title="Notifications">
            {modes}
          </Disclosure>
        )}
        {/* Its own box, so the rail's column (fill-column: the height of the body) no longer pushes the worlds to the foot. */}
        <div>{rail}</div>
        {worlds === undefined ? null : (
          <div className={styles["worlds"]}>
            <Folding name="Worlds">
              <WorldRows {...worlds} />
            </Folding>
          </div>
        )}
      </div>
    </div>
  );
}

/** The rooms' control and the drawer holding `rail`, on a narrow chat's screen. On a `phone` the control is the band's `#` and the drawer
 * a side one over the modes, `rail` and, on a short window, `worlds`; a computer's compact chat keeps its small control and plain
 * dialog. */
export function RoomsDrawer({
  unread,
  phone,
  ...body
}: Body & {
  unread: number;
  /** The room's notification modes (NoticeModes) stand in the drawer on a phone: its name's menu, which held them, is no longer there. */
  phone: boolean;
}) {
  // Open at an address: a move to another closes it, as the room behind it changes (as Saved's does).
  const { key } = useLocation();
  const [opened, setOpened] = useState<string>();
  const close = () => {
    setOpened(undefined);
  };
  useRoomsAsked(phone, key, setOpened);
  return (
    <>
      <Control
        unread={unread}
        phone={phone}
        onOpen={() => {
          setOpened(key);
        }}
      />
      <Dialog title="Rooms" {...(phone ? { side: "start" } : {})} open={opened === key} onClose={close}>
        {phone ? <PhoneBody {...body} close={close} /> : <div onClick={leave(close)}>{body.rail}</div>}
      </Dialog>
    </>
  );
}

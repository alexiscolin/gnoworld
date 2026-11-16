// The rooms on a phone: from 900 px down (the design system's one breakpoint, ChatScreen's) the room list and the
// direct messages sit behind one control in the chat's header, a drawer built on ui's Dialog (its focus trap, Escape,
// and the focus given back to the control). The control says the unseen count in its name while the drawer is closed.
import { Button, Chip, Dialog } from "@gnoworld/ui";
import { useState, type MouseEvent, type ReactNode } from "react";
import { useLocation } from "react-router";
import { countWords } from "./unread.ts";
import styles from "./RoomsDrawer.module.css";

// A link followed leaves the drawer, the room in view's own too, whose address does not change.
const leave = (close: () => void) => (event: MouseEvent) => {
  if (event.target instanceof Element && event.target.closest("a") !== null) close();
};

/** The control for the rooms and the drawer holding `rail`, on a narrow chat's screen: the control is drawn in the header's place, the
 * drawer, a modal dialog, over the screen whatever place draws it. Its code comes once the screen is narrow. On a `phone` (the window
 * under 900 px) the control is 44 px and the drawer a side one, keeping its title and Close and scrolling `rail` and, below it,
 * `worlds`; a compact chat of a computer's window keeps its small control and plain dialog. */
export function RoomsDrawer({
  unread,
  rail,
  worlds,
  phone,
}: {
  unread: number;
  rail: ReactNode;
  worlds?: ReactNode;
  phone: boolean;
}) {
  // Open at an address: a move to another closes it, as the room behind it changes (as Saved's does).
  const { key } = useLocation();
  const [opened, setOpened] = useState<string>();
  const close = () => {
    setOpened(undefined);
  };
  return (
    <>
      <div>
        <Button
          icon="menu"
          emphasis="quiet"
          size={phone ? "m" : "s"}
          onClick={() => {
            setOpened(key);
          }}
        >
          {unread > 0 ? (
            <>
              {/* Named once, "Rooms, 3 unread", by the hidden words: the count follows as a mark. */}
              <span aria-hidden="true">Rooms</span>
              <span className="visually-hidden">{`Rooms, ${countWords(unread)} unread`}</span>
              <span aria-hidden="true">
                <Chip tone="signal">{countWords(unread)}</Chip>
              </span>
            </>
          ) : (
            "Rooms"
          )}
        </Button>
      </div>
      <Dialog title="Rooms" {...(phone ? { side: "start" } : {})} open={opened === key} onClose={close}>
        {phone ? (
          <div className={styles["drawer"]}>
            {/* The dialog's own title is for assistive technology alone in a drawer: this one is the sighted reader's, beside Close. */}
            <p className={styles["title"]} aria-hidden="true">
              Rooms
            </p>
            <div className={styles["body"]} data-drawer-body="" onClick={leave(close)}>
              {rail}
              {worlds}
            </div>
          </div>
        ) : (
          <div onClick={leave(close)}>{rail}</div>
        )}
      </Dialog>
    </>
  );
}

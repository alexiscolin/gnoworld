// The rooms on a phone (slice 5's 5b, U3): from 900 px down (the design system's one breakpoint, ChatScreen's) the room list and the
// direct messages sit behind one control in the chat's header, a drawer built on ui's Dialog (its focus trap, Escape,
// and the focus given back to the control). The control says the unseen count in its name while the drawer is closed.
import { Button, Chip, Dialog } from "@gnoworld/ui";
import { useState, type ReactNode } from "react";
import { useLocation } from "react-router";
import { countWords } from "./unread.ts";

/** The control for the rooms and the drawer holding `rail`, on a phone's screen: the control is drawn in the header's place, the
 * drawer, a modal dialog, over the screen whatever place draws it. Its code comes once the screen is a phone's. */
export function RoomsDrawer({ unread, rail }: { unread: number; rail: ReactNode }) {
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
          size="s"
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
      <Dialog title="Rooms" open={opened === key} onClose={close}>
        {/* A link followed leaves the drawer, the room in view's own too, whose address does not change. */}
        <div
          onClick={(event) => {
            if (event.target instanceof Element && event.target.closest("a") !== null) close();
          }}
        >
          {rail}
        </div>
      </Dialog>
    </>
  );
}

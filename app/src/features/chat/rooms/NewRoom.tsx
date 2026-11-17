// A room anyone signed in makes on the Earth: a button, and a small dialog with the room's name (NewRoomDialog.tsx), whose code is asked at
// the first press: the chat carries only the button.
import type { RoomList } from "@gnoworld/schemas";
import { Button, IconButton } from "@gnoworld/ui";
import { lazy, Suspense, useState } from "react";
import { useApp } from "../../../storeContext.tsx";
import styles from "./NewRoom.module.css";

const NewRoomDialog = lazy(async () => ({ default: (await import("./NewRoomDialog.tsx")).NewRoomDialog }));

// The Earth's list always holds its main room, which no other world's does by that name.
const onEarth = (sections: RoomList["sections"]): boolean =>
  sections.some(({ rooms }) => rooms.some(({ room }) => room === "#earth"));

/** Whether the reader may make a room here: signed in, on the Earth (a guest and another world see no button). */
export function useMayMakeRoom(sections: RoomList["sections"]): boolean {
  const signedIn = useApp(({ login }) => login.session.kind === "in");
  return signedIn && onEarth(sections);
}

function Trigger({ wide, onOpen }: { wide: boolean; onOpen: () => void }) {
  return wide ? (
    <div className={styles["wide"]}>
      <Button icon="plus" onClick={onOpen}>
        New room
      </Button>
    </div>
  ) : (
    <IconButton icon="plus" label="New room" size="xs" onClick={onOpen} />
  );
}

/** Its button: a "+" by default; `wide`, a phone drawer's, the full-width outlined button at the list's foot. */
/** Its button: a "+" by default; `wide`, a phone drawer's, the full-width outlined button at the list's foot. */
export function NewRoom({ wide = false }: { wide?: boolean }) {
  const [asked, setAsked] = useState(false);
  const [open, setOpen] = useState(false);
  return (
    <>
      <Trigger
        wide={wide}
        onOpen={() => {
          setAsked(true);
          setOpen(true);
        }}
      />
      {asked ? (
        <Suspense fallback={null}>
          <NewRoomDialog
            open={open}
            onClose={() => {
              setOpen(false);
            }}
          />
        </Suspense>
      ) : null}
    </>
  );
}

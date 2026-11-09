// The place's own buttons in the chat's header (Alexis, 2026-11-07: "Who's here et Events devraient être des boutons à côté, ça ne fait
// rien dans le chat"): who is here, which takes the reader to the people, and the place's events in the calendar. The pills over the
// composer keep what acts in the conversation (QuickActions.tsx).
import { IconButton } from "@gnoworld/ui";
import { lazy, Suspense, useState } from "react";
import { useControlSize } from "./full.ts";

const Calendar = lazy(async () => (await import("../events/index.ts")).calendar());

function useCalendar(world: string) {
  // Asked once: the dialog stays in the page after, so the browser gives the focus back to its button as it closes.
  const [asked, setAsked] = useState(false);
  const [open, setOpen] = useState(false);
  return {
    open: () => {
      setAsked(true);
      setOpen(true);
    },
    dialog: asked ? (
      <Suspense fallback={null}>
        <Calendar
          world={world}
          open={open}
          onClose={() => {
            setOpen(false);
          }}
        />
      </Suspense>
    ) : null,
  };
}

/** Who is here and the events of `world`, its own first in the calendar; at the controls' height beside them. */
export function PlaceButtons({ world, onWhoIsHere }: { world: string; onWhoIsHere: () => void }) {
  const calendar = useCalendar(world);
  const size = useControlSize();
  return (
    <>
      <IconButton icon="people" label="Who's here" size={size} onClick={onWhoIsHere} />
      <IconButton icon="calendar" label="Events" size={size} onClick={calendar.open} />
      {calendar.dialog}
    </>
  );
}

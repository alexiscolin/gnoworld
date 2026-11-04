// The row of quick actions over the composer (the video's frames 31 and 36): only what works today. Quiz and Poll wait for phase 1. The
// calendar's code and its data come at the first press, out of the late chat's budget.
import { lazy, Suspense, useState, type ReactNode } from "react";
import styles from "./QuickActions.module.css";

const Calendar = lazy(async () => (await import("../events/index.ts")).calendar());

export interface QuickActionsProps {
  onWhoIsHere: () => void;
  /** The world the chat is in, by its slug: its events come first in the calendar. */
  world: string;
}

// One pill of the row: an edge, the words centred, the row's width shared among the pills.
function Action({ label, onClick }: { label: string; onClick: () => void }) {
  return (
    <button type="button" className={styles["action"]} onClick={onClick}>
      {label}
    </button>
  );
}

export function QuickActions({ onWhoIsHere, world }: QuickActionsProps) {
  // Asked once: the dialog stays in the page after, so the browser gives the focus back to the pill as it closes.
  const [asked, setAsked] = useState(false);
  const [open, setOpen] = useState(false);
  return (
    <div role="toolbar" aria-label="Quick actions" className={styles["bar"]}>
      <Action label="Who's here" onClick={onWhoIsHere} />
      <Action
        label="Events"
        onClick={() => {
          setAsked(true);
          setOpen(true);
        }}
      />
      {asked ? (
        <Suspense fallback={null}>
          <Calendar
            world={world}
            open={open}
            onClose={() => {
              setOpen(false);
            }}
          />
        </Suspense>
      ) : null}
    </div>
  );
}

/** What goes under a room's lines: the quick actions over what writes (the composer, or a visitor's word). */
export function Dock({ onWhoIsHere, world, children }: QuickActionsProps & { children: ReactNode }) {
  return (
    <div className={styles["dock"]}>
      <QuickActions onWhoIsHere={onWhoIsHere} world={world} />
      {children}
    </div>
  );
}

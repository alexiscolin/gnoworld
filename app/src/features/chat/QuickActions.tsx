// The row of quick actions over the composer (the video's frame 23.58.01, bottom): only what works today, then the world's pinned
// actions (D271), which the world's route hands the chat. Quiz and Poll wait for phase 1; Calendar for its data and its own slice.
import type { ReactNode } from "react";
import styles from "./QuickActions.module.css";

export interface QuickActionsProps {
  onWhoIsHere: () => void;
  /** The world's pinned actions after Who's here, each a button or a link the row draws as a pill. */
  pills?: ReactNode;
}

/** A world's pinned actions as its route hands them, drawn as their code comes. */
export interface Pinned {
  pills: ReactNode;
  cards: ReactNode;
}

/** What goes under a room's lines (ChatScreen's Dock): the cards a pinned action opens, the row, then what writes. */
export interface DockProps {
  onWhoIsHere: () => void;
  pinned: Pinned | undefined;
  children: ReactNode;
}

// One pill of the row: an edge, the words centred, the row's width shared among the pills (the row's look).
function Action({ label, onClick }: { label: string; onClick: () => void }) {
  return (
    <button type="button" onClick={onClick}>
      {label}
    </button>
  );
}

export function QuickActions({ onWhoIsHere, pills }: QuickActionsProps) {
  return (
    <div role="toolbar" aria-label="Quick actions" className={styles["bar"]}>
      <Action label="Who's here" onClick={onWhoIsHere} />
      {pills}
    </div>
  );
}

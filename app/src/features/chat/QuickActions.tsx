// The row of quick actions over the composer (the video's frame 23.58.01, bottom): only what works today. Quiz and Poll
// wait for phase 1; Calendar for its data.
import styles from "./QuickActions.module.css";

export interface QuickActionsProps {
  onWhoIsHere: () => void;
  /** Draws Calendar once there is something behind it. */
  onCalendar?: (() => void) | undefined;
}

// One pill of the row: an edge, the words centred, the row's width shared among the pills.
function Action({ label, onClick }: { label: string; onClick: () => void }) {
  return (
    <button type="button" className={styles["action"]} onClick={onClick}>
      {label}
    </button>
  );
}

export function QuickActions({ onWhoIsHere, onCalendar }: QuickActionsProps) {
  return (
    <div role="toolbar" aria-label="Quick actions" className={styles["bar"]}>
      <Action label="Who's here" onClick={onWhoIsHere} />
      {onCalendar === undefined ? null : <Action label="Calendar" onClick={onCalendar} />}
    </div>
  );
}

// The row of quick actions over the composer (the video's frame 23.58.01, bottom): only what works today. Quiz and Poll
// wait for phase 1; Calendar for its data.
import { Chip, Cluster } from "@gnoworld/ui";
import styles from "./QuickActions.module.css";

export interface QuickActionsProps {
  onWhoIsHere: () => void;
  /** Draws Calendar once there is something behind it. */
  onCalendar?: (() => void) | undefined;
}

export function QuickActions({ onWhoIsHere, onCalendar }: QuickActionsProps) {
  return (
    <div role="toolbar" aria-label="Quick actions" className={styles["bar"]}>
      <Cluster space="2xs">
        <Chip onClick={onWhoIsHere}>Who&apos;s here</Chip>
        {onCalendar === undefined ? null : <Chip onClick={onCalendar}>Calendar</Chip>}
      </Cluster>
    </div>
  );
}

import type { ReactNode } from "react";
import styles from "./ChatLayout.module.css";

export interface ChatLayoutProps {
  /** Across the top: the place, the room's name and the controls. */
  header: ReactNode;
  /** The column of worlds, at the left edge; none draws no column. */
  worlds?: ReactNode;
  /** The room sidebar; none draws none (a phone keeps it behind a control). */
  rooms?: ReactNode;
  /** The panel at the right edge; none draws none. */
  info?: ReactNode;
  /** The panel takes the conversation's place where the screen is narrow, as a thread's does. */
  infoFirst?: boolean;
  children: ReactNode;
}

/** The full-screen chat's frame (the video's frame 23.58.01): a header across, then the worlds, the rooms, the
 * conversation and the info panel, each a region that holds its own scroll. It places; the app fills the slots, and the conversation's own list scrolls
 * inside it, over a composer that stays. */
export function ChatLayout({ header, worlds, rooms, info, infoFirst, children }: ChatLayoutProps) {
  return (
    <div className={styles["root"]} data-chat-layout="" data-info-first={infoFirst === true ? "" : undefined}>
      <div className={styles["header"]} data-region="header">
        {header}
      </div>
      <div className={styles["body"]}>
        {worlds === undefined ? null : (
          <div className={styles["worlds"]} data-region="worlds">
            {worlds}
          </div>
        )}
        {rooms === undefined ? null : (
          <div className={styles["rooms"]} data-region="rooms">
            {rooms}
          </div>
        )}
        <div className={styles["conversation"]} data-region="conversation">
          {children}
        </div>
        {info === undefined ? null : (
          <div className={styles["info"]} data-region="info">
            {info}
          </div>
        )}
      </div>
    </div>
  );
}

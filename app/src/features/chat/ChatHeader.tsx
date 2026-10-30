// The full-screen chat's header (the video's frame 23.58.01, top): the place's kicker, the room's name and, at the far end,
// the expand and close controls. A control with no action to give is not drawn: no dead button.
import { Cluster, IconButton, Kicker } from "@gnoworld/ui";
import type { ReactNode } from "react";
import styles from "./ChatHeader.module.css";

export interface ChatHeaderProps {
  kicker: string;
  /** The room's name, or a direct message's partner. */
  title: ReactNode;
  /** Whether the chat fills the screen: the control then shrinks it, else expands it. */
  expanded?: boolean;
  onExpand?: () => void;
  onClose?: () => void;
  /** The control to the rooms, before the name, on a phone's screen (5b's drawer). */
  rooms?: ReactNode;
}

export function ChatHeader({ kicker, title, expanded = false, onExpand, onClose, rooms }: ChatHeaderProps) {
  return (
    <Cluster as="header" space="m">
      {rooms}
      <Kicker>{kicker}</Kicker>
      <h2 className={styles["title"]}>{title}</h2>
      <div className={styles["controls"]}>
        <Cluster space="2xs">
          {onExpand === undefined ? null : (
            <IconButton
              icon={expanded ? "shrink" : "expand"}
              label={expanded ? "Shrink the chat" : "Expand the chat"}
              size="s"
              onClick={onExpand}
            />
          )}
          {onClose === undefined ? null : <IconButton icon="close" label="Close the chat" size="s" onClick={onClose} />}
        </Cluster>
      </div>
    </Cluster>
  );
}

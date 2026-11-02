// The chat's header (the video's frames 26 and 66, top): the place's kicker, the room's name and, at the far end, the control
// that expands the dock to the full chat or shrinks it back, and the close control.
import { Cluster, Dialog, Icon, IconButton, Kicker } from "@gnoworld/ui";
import { useState, type ReactNode } from "react";
import styles from "./ChatHeader.module.css";

export interface ChatHeaderProps {
  kicker: string;
  /** The room's name, or a direct message's partner. */
  title: ReactNode;
  onClose: () => void;
  /** Expands the docked chat to the full chat, or shrinks the full one to its dock: none where there is no dock to go to. */
  size?: { full: boolean; onToggle: () => void } | undefined;
  /** What the name opens, behind a chevron after it (what the room says of itself, its modes): none draws a plain name. */
  menu?: { label: string; content: ReactNode } | undefined;
  /** A short mark after the name, always in view: a direct message's "Not encrypted", drawn by its own code. */
  mark?: ReactNode;
  /** The control to the rooms, before the name, on a phone's screen (5b's drawer). */
  rooms?: ReactNode;
}

// The room's name, and when it has a menu a button that opens it in the design system's dialog, which the first screen holds
// already: a chevron after the name says it opens.
function Name({ title, menu }: Pick<ChatHeaderProps, "title" | "menu">) {
  const [open, setOpen] = useState(false);
  if (menu === undefined) return <h2 className={styles["title"]}>{title}</h2>;
  return (
    <>
      <h2 className={styles["title"]}>
        <button
          type="button"
          className={styles["trigger"]}
          aria-haspopup="dialog"
          onClick={() => {
            setOpen(true);
          }}
        >
          {title}
          <Icon name="chevron" />
        </button>
      </h2>
      <Dialog
        title={menu.label}
        open={open}
        onClose={() => {
          setOpen(false);
        }}
      >
        {menu.content}
      </Dialog>
    </>
  );
}

export function ChatHeader({ kicker, title, onClose, size, rooms, menu, mark }: ChatHeaderProps) {
  return (
    <Cluster as="header" space="m">
      <div className={styles["place"]}>
        {rooms}
        <Kicker>{kicker}</Kicker>
      </div>
      <Name title={title} menu={menu} />
      {mark}
      <div className={styles["controls"]}>
        <Cluster space="2xs">
          {size === undefined ? null : (
            <IconButton
              icon={size.full ? "shrink" : "expand"}
              label={size.full ? "Shrink the chat" : "Expand the chat"}
              size="s"
              onClick={size.onToggle}
            />
          )}
          <IconButton icon="close" label="Close the chat" size="s" onClick={onClose} />
        </Cluster>
      </div>
    </Cluster>
  );
}

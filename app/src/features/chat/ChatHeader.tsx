// The full-screen chat's header (the video's frame 23.58.01, top): the place's kicker, the room's name and, at the far end,
// the close control. Shrink to the dock waits for slice 7, which brings the dock it shrinks to: no dead button before.
import { Cluster, Dialog, Icon, IconButton, Kicker } from "@gnoworld/ui";
import { useState, type ReactNode } from "react";
import styles from "./ChatHeader.module.css";

export interface ChatHeaderProps {
  kicker: string;
  /** The room's name, or a direct message's partner. */
  title: ReactNode;
  onClose?: () => void;
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

export function ChatHeader({ kicker, title, onClose, rooms, menu, mark }: ChatHeaderProps) {
  return (
    <Cluster as="header" space="m">
      {rooms}
      <Kicker>{kicker}</Kicker>
      <Name title={title} menu={menu} />
      {mark}
      <div className={styles["controls"]}>
        <Cluster space="2xs">
          {onClose === undefined ? null : <IconButton icon="close" label="Close the chat" size="s" onClick={onClose} />}
        </Cluster>
      </div>
    </Cluster>
  );
}

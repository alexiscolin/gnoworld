// The chat's header (the video's frames 26 and 66, top): the room's name and the place's buttons; the site header's Chat and the chat's own
// arrows open a docked chat full, its arrows or a level close it (D441, D445), and a chat with no dock (a phone's screen) has a close.
import { Cluster, Dialog, Icon, IconButton, Sidebar } from "@gnoworld/ui";
import { useState, type ReactNode } from "react";
import { useLocation } from "react-router";
import { useControlSize, useFull } from "./full.ts";
// The site's header's divider, the same rule in the chat's band.
import site from "../../shellHeader.module.css";
import { FullButton } from "./FullButton.tsx";
import styles from "./ChatHeader.module.css";

export interface ChatHeaderProps {
  /** The room's name, or a direct message's partner. */
  title: ReactNode;
  onClose: () => void;
  /** Whether the chat has a dock: it opens full from it and goes back to it (D441); without one it is closed. */
  docked?: boolean | undefined;
  /** What the name opens, behind a chevron after it (the place's rooms under a search, D487): none draws a plain name. */
  menu?: { label: string; content: ReactNode } | undefined;
  /** A short mark after the name, always in view: a direct message's "Not encrypted", drawn by its own code. */
  mark?: ReactNode;
  /** The control to the rooms, before the name, on a phone's screen (5b's drawer). */
  rooms?: ReactNode;
  /** The place's own buttons, after its name (PlaceButtons.tsx). */
  buttons?: ReactNode;
  /** The place's own name, before the room's in the wide full chat ("Bubble / #general"). */
  world?: string | undefined;
}

// A name in the wide full chat's row, which gives way at its end.
const CUT = [styles["title"], "truncate"].join(" ");

// "Bubble / #general" in the wide full chat, one size, no network's name (Alexis, 2026-11-07); a room named as its place says it once,
// and a long name gives way at its end.
function Where({ world, title, menu }: Pick<ChatHeaderProps, "world" | "title" | "menu">) {
  const same = typeof title === "string" && title.replace(/^#/, "").toLowerCase() === world?.toLowerCase();
  return (
    <div className={styles["where"]}>
      {world === undefined || same ? null : (
        <>
          <span className={CUT}>{world}</span>
          <span className={styles["slash"]} aria-hidden="true">
            /
          </span>
        </>
      )}
      <Name title={title} menu={menu} short />
    </div>
  );
}

// The room's name, and when it has a menu a button that opens it in the design system's dialog, which the first screen holds
// already: a chevron after the name says it opens. It is open on the page it was opened on: a room picked in it closes it.
function Name({ title, menu, short = false }: Pick<ChatHeaderProps, "title" | "menu"> & { short?: boolean }) {
  const { key } = useLocation();
  const [openAt, setOpenAt] = useState<string>();
  const open = openAt === key;
  const look = short ? CUT : styles["title"];
  if (menu === undefined) return <h2 className={look}>{title}</h2>;
  return (
    <>
      <h2 className={look}>
        <button
          type="button"
          className={`inline-columns ${String(styles["trigger"])}`}
          aria-haspopup="dialog"
          onClick={() => {
            setOpenAt(key);
          }}
        >
          <span className="truncate">{title}</span>
          <Icon name="chevron" />
        </button>
      </h2>
      <Dialog
        title={menu.label}
        open={open}
        onClose={() => {
          setOpenAt(undefined);
        }}
      >
        {menu.content}
      </Dialog>
    </>
  );
}

// The header's controls at the row's end: docked, the dock's small ones after the place's buttons and a small rule; in the full chat, the
// site's own height, over the info column, where the site's account stands beside them (shellHeader.module.css).
function Controls({
  docked = false,
  onClose,
  lead,
  wide,
}: Pick<ChatHeaderProps, "docked" | "onClose"> & { lead: ReactNode; wide: boolean }) {
  const control = useControlSize();
  const full = useFull();
  return (
    <div className={wide ? [styles["controls"], styles["over"]].join(" ") : styles["controls"]}>
      <Cluster space="2xs" justify="end">
        {lead}
        {/* A rule between the place's buttons and the close after them; a docked chat has none. */}
        {lead === undefined || docked ? null : <span className={site["divider"]} aria-hidden="true" />}
        {/* A chat with a dock is never closed (Alexis, 2026-11-07): it opens full from here, and the full chat closes from its own bar (PlaceView.tsx); one with none is closed. */}
        {docked || <IconButton icon="close" label="Close the chat" size={control} onClick={onClose} />}
        {docked && !full ? <FullButton full={false} /> : null}
      </Cluster>
    </div>
  );
}

export function ChatHeader({ title, onClose, docked, rooms, menu, mark, world, buttons }: ChatHeaderProps) {
  // The wide full chat's band, under the site's header: the worlds' and rooms' columns' room, then the place and the room (Where);
  // docked, the rooms' control, then the room's name: no place's name, which the dock's row always cut (Alexis, 2026-11-07).
  const wide = useFull() && rooms === undefined;
  return (
    <Cluster as="header" space="m">
      <div className={styles["place"]}>{wide ? null : rooms}</div>
      {wide ? (
        // Over the conversation's column: the place and the room at its start, its buttons at its end, over the lines' times.
        <div className={styles["middle"]}>
          <Sidebar side="end" align="center">
            <Where world={world} title={title} menu={menu} />
            {buttons === undefined ? null : (
              <Cluster space="2xs" justify="end">
                {buttons}
              </Cluster>
            )}
          </Sidebar>
        </div>
      ) : (
        <Name title={title} menu={menu} />
      )}
      {mark === undefined ? null : <span className={styles["mark"]}>{mark}</span>}
      <Controls docked={docked} onClose={onClose} lead={wide ? undefined : buttons} wide={wide} />
    </Cluster>
  );
}

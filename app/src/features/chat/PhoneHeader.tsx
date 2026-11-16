// A phone's chat header, one row at every size: Rooms, the place's name, its acts (search, who is here) and Info. No Back: a phone has no
// home to go back to (the browser's own back still works). Every control is 44 px.
import { Cluster, IconButton } from "@gnoworld/ui";
import type { ReactNode } from "react";
import { Name, type ChatHeaderProps } from "./ChatHeader.tsx";
import type { Act } from "./PlaceActs.tsx";
import styles from "./PhoneHeader.module.css";

export interface PhoneHeaderProps {
  /** The room's name, or a direct message's partner. */
  title: ReactNode;
  /** What the name opens (ChatHeader's): the rooms and, signed in, their notification modes. */
  menu?: ChatHeaderProps["menu"];
  /** A short mark after the name: a direct message's "Not encrypted". */
  mark?: ReactNode;
  onInfo: () => void;
  /** The control to the rooms' drawer. */
  rooms: ReactNode;
  /** The place's acts; only those that do something are drawn (a phone has no room for what is to come). */
  acts: readonly Act[];
}

export function PhoneHeader({ title, menu, mark, onInfo, rooms, acts }: PhoneHeaderProps) {
  return (
    <Cluster space="2xs" wrap="no" className={styles["bar"]}>
      {rooms}
      {/* The name is ChatHeader's own (its menu, its one line cut with an ellipsis), in the room the row leaves. */}
      <div className={styles["title"]}>
        <Name title={title} menu={menu} short />
      </div>
      {mark === undefined ? null : (
        <span className={styles["mark"]} data-mark="">
          {mark}
        </span>
      )}
      {acts.map(({ label, icon, onSelect }) =>
        onSelect === undefined ? null : <IconButton key={label} icon={icon} label={label} onClick={onSelect} />,
      )}
      <IconButton icon="info" label="Info" onClick={onInfo} />
    </Cluster>
  );
}

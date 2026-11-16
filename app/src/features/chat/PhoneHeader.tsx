// A phone's chat header: back, the place's name and Info on a first row; Rooms and the place's acts (search, who is here) on a second,
// in thumb reach. Landscape, where height is short, lays them on one row (PhoneHeader.module.css). Every control is 44 px.
import { Cluster, IconButton, Stack } from "@gnoworld/ui";
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
  onBack: () => void;
  onInfo: () => void;
  /** The control to the rooms' drawer. */
  rooms: ReactNode;
  /** The place's acts; only those that do something are drawn (a phone has no room for what is to come). */
  acts: readonly Act[];
}

export function PhoneHeader({ title, menu, mark, onBack, onInfo, rooms, acts }: PhoneHeaderProps) {
  return (
    <Stack space="3xs" className={styles["bar"]}>
      <Cluster space="2xs" wrap="no" className={styles["top"]}>
        <span className={styles["back"]}>
          <IconButton icon="arrow" label="Back" emphasis="plain" onClick={onBack} />
        </span>
        {/* The name is ChatHeader's own (its menu, its one line cut with an ellipsis), in the room the row leaves. */}
        <div className={styles["title"]}>
          <Name title={title} menu={menu} short />
        </div>
        {mark === undefined ? null : (
          <span className={styles["mark"]} data-mark="">
            {mark}
          </span>
        )}
        <IconButton icon="info" label="Info" onClick={onInfo} />
      </Cluster>
      <Cluster space="2xs" wrap="no" className={styles["tools"]}>
        <div className={styles["rooms"]}>{rooms}</div>
        {acts.map(({ label, icon, onSelect }) =>
          onSelect === undefined ? null : <IconButton key={label} icon={icon} label={label} onClick={onSelect} />,
        )}
      </Cluster>
    </Stack>
  );
}

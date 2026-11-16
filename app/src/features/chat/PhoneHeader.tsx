// A phone's chat header: back, the place's name and Info on a first row; Rooms and the place's acts (search, who is here) on a second,
// in thumb reach. Landscape, where height is short, lays them on one row (PhoneHeader.module.css). Every control is 44 px.
import { IconButton } from "@gnoworld/ui";
import type { ReactNode } from "react";
import type { Act } from "./PlaceActs.tsx";
import styles from "./PhoneHeader.module.css";

export interface PhoneHeaderProps {
  /** The room's name, or a direct message's partner. */
  title: ReactNode;
  /** A short mark after the name: a direct message's "Not encrypted". */
  mark?: ReactNode;
  onBack: () => void;
  onInfo: () => void;
  /** The control to the rooms' drawer. */
  rooms: ReactNode;
  /** The place's acts; only those that do something are drawn (a phone has no room for what is to come). */
  acts: readonly Act[];
}

export function PhoneHeader({ title, mark, onBack, onInfo, rooms, acts }: PhoneHeaderProps) {
  return (
    <div className={styles["bar"]}>
      <div className={styles["top"]}>
        <span className={styles["back"]}>
          <IconButton icon="arrow" label="Back" emphasis="plain" onClick={onBack} />
        </span>
        <h1 className={[styles["title"], "truncate"].join(" ")} title={typeof title === "string" ? title : undefined}>
          {title}
        </h1>
        {mark === undefined ? null : (
          <span className={styles["mark"]} data-mark="">
            {mark}
          </span>
        )}
        <IconButton icon="info" label="Info" onClick={onInfo} />
      </div>
      <div className={styles["tools"]}>
        <div className={styles["rooms"]}>{rooms}</div>
        {acts.map(({ label, icon, onSelect }) =>
          onSelect === undefined ? null : <IconButton key={label} icon={icon} label={label} onClick={onSelect} />,
        )}
      </div>
    </div>
  );
}

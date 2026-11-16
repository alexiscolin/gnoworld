// A phone's rooms row, the second row of the place band (PhoneBand.tsx, whose `children` it is): the rooms' control (a `#` with the unseen
// count, opening the drawer) and the chat's search side by side at the start, then the rooms as chips (RoomChips, the dock's own, whose "+N" opens the same drawer). 44 px
// targets all; no Back (a phone has no home), no people (Info holds them) and no Info icon (the band's place is that button).
import { Cluster, IconButton } from "@gnoworld/ui";
import type { ReactNode } from "react";
import type { Act } from "./PlaceActs.tsx";
import styles from "./PhoneHeader.module.css";

export interface PhoneHeaderProps {
  /** The control to the rooms' drawer. */
  rooms: ReactNode;
  /** The rooms as chips (RoomChips): none draws only the control and the search. */
  chips?: ReactNode;
  /** The chat's search, drawn only where it does something. */
  search: Act;
}

export function PhoneHeader({ rooms, chips, search }: PhoneHeaderProps) {
  return (
    <Cluster space="2xs" wrap="no" className={styles["bar"]}>
      <Cluster space="3xs" wrap="no" className={styles["tools"]}>
        {rooms}
        {search.onSelect === undefined ? null : (
          <IconButton icon={search.icon} label={search.label} size="s" emphasis="plain" onClick={search.onSelect} />
        )}
      </Cluster>
      <div className={styles["chips"]}>{chips}</div>
    </Cluster>
  );
}

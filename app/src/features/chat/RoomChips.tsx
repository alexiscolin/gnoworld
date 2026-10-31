// The docked chat's rooms as chips under its header (the video's frame 26): one link to each room, the one in view cream, a
// count after the one that holds something unseen. The full chat has its column, a phone its drawer; this row is the dock's.
import type { RoomList } from "@gnoworld/schemas";
import { Cluster } from "@gnoworld/ui";
import { Link } from "react-router";
import { useFull } from "./full.ts";
import { roomHref, roomLabel } from "./names.ts";
import { badged } from "./unread.ts";
import styles from "./RoomChips.module.css";

export interface RoomChipsProps {
  sections: RoomList["sections"];
  current: string | undefined;
  /** What each room holds unseen; none for none. */
  badges?: Readonly<Record<string, number>> | undefined;
}

export function RoomChips({ sections, current, badges }: RoomChipsProps) {
  const full = useFull();
  const rooms = sections.flatMap((section) => section.rooms.map(({ room }) => room));
  if (rooms.length === 0) return null;
  return (
    <nav aria-label="Room shortcuts" className={styles["row"]}>
      <Cluster as="ul" space="2xs">
        {rooms.map((room) => {
          const unseen = badged(badges?.[room]);
          return (
            <li key={room}>
              <Link
                to={roomHref(room, full)}
                className={styles["chip"]}
                aria-current={room === current ? "true" : undefined}
              >
                {roomLabel(room)}
                {unseen === undefined ? null : (
                  <>
                    {unseen.count === undefined ? null : <span aria-hidden="true">{unseen.count}</span>}
                    <span className="visually-hidden">{unseen.said}</span>
                  </>
                )}
              </Link>
            </li>
          );
        })}
      </Cluster>
    </nav>
  );
}

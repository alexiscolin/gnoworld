// A world's rooms by section (slice 4's 4b): the sections the server lists, in its order, a section with no
// room left out; each room a link to its address on the site, the one shown marked.
import type { RoomList } from "@gnoworld/schemas";
import { Row, Stack } from "@gnoworld/ui";
import { roomHref, roomLabel } from "./names.ts";
import shared from "./lists.module.css";
import styles from "./RoomsView.module.css";

export interface RoomsViewProps {
  sections: RoomList["sections"];
  current: string | undefined;
}

export function RoomsView({ sections, current }: RoomsViewProps) {
  const shown = sections.filter(({ rooms }) => rooms.length > 0);
  return (
    <nav aria-label="Rooms" className={shared["scrolls"]}>
      {shown.length === 0 ? (
        <p>No room here yet.</p>
      ) : (
        <Stack space="m">
          {shown.map(({ name, rooms }) => (
            <Stack key={name ?? ""} space="2xs" as="section">
              <h2 className={styles["section"]}>{name ?? (shown.length === 1 ? "Rooms" : "Other rooms")}</h2>
              <ul className={shared["plain"]}>
                {rooms.map(({ room }) => (
                  <li key={room}>
                    <Row title={roomLabel(room)} href={roomHref(room)} current={room === current} />
                  </li>
                ))}
              </ul>
            </Stack>
          ))}
        </Stack>
      )}
    </nav>
  );
}

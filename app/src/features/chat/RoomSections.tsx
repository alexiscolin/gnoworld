// A world's rooms by section, each a link to its address, the one shown marked (slice 4's 4b): the part of the rooms'
// navigation a visitor has too. An account's direct messages and notices are RoomsView's.
import type { RoomList as Rooms } from "@gnoworld/schemas";
import { NavItem, Stack, type NavItemProps } from "@gnoworld/ui";
import type { ReactNode, Ref } from "react";
import { useFull } from "./full.ts";
import { roomHref, roomLabel } from "./names.ts";
import shared from "./lists.module.css";
import styles from "./RoomsView.module.css";

/** The rooms' navigation: the one place the keyboard's focus may be sent to (a notice's link or Clear leaves it). */
export function RoomsNav({
  label,
  navRef,
  children,
}: {
  label: string;
  navRef?: Ref<HTMLElement>;
  children: ReactNode;
}) {
  return (
    <nav ref={navRef} tabIndex={-1} aria-label={label} className={styles["nav"]}>
      {children}
    </nav>
  );
}

export interface RoomSectionsProps {
  sections: Rooms["sections"];
  current: string | undefined;
  /** What says the rooms could not load, in their place (CR8). */
  failed?: ReactNode;
  /** What a room holds unseen, at the end of its item: none for none. */
  badge?: ((room: string) => NavItemProps["badge"]) | undefined;
}

export function RoomSections({ sections, current, failed, badge }: RoomSectionsProps) {
  const full = useFull();
  const shown = sections.filter(({ rooms }) => rooms.length > 0);
  if (failed !== undefined) return failed;
  if (shown.length === 0) return <p>No room here yet.</p>;
  return (
    <Stack space="m">
      {shown.map(({ name, rooms }) => (
        <Stack key={name ?? ""} space="2xs" as="section">
          <h2 className={styles["section"]}>{name ?? (shown.length === 1 ? "Rooms" : "Other rooms")}</h2>
          <ul className={[shared["plain"], shared["items"]].join(" ")}>
            {rooms.map(({ room }) => (
              <li key={room}>
                <NavItem href={roomHref(room, full)} current={room === current} badge={badge?.(room)}>
                  {roomLabel(room)}
                </NavItem>
              </li>
            ))}
          </ul>
        </Stack>
      ))}
    </Stack>
  );
}

// A world's rooms by section, each a link to its address, the one shown marked (slice 4's 4b): the part of the rooms'
// navigation a visitor has too. An account's direct messages and notices are RoomsView's.
import type { RoomList as Rooms } from "@gnoworld/schemas";
import { Cluster, Icon, NavItem, Stack, type NavItemProps } from "@gnoworld/ui";
import { useId, useState, type ReactNode, type Ref } from "react";
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
    <nav ref={navRef} tabIndex={-1} aria-label={label} className={[styles["nav"], "fill-column"].join(" ")}>
      {children}
    </nav>
  );
}

/** A section of the column, as Discord's and Slack's: its name folds and unfolds it, a control may stand at its end (a "+"). */
export function Folding({ name, action, children }: { name: string; action?: ReactNode; children: ReactNode }) {
  const [open, setOpen] = useState(true);
  const id = useId();
  return (
    <Stack space="2xs" as="section">
      <Cluster justify="between">
        <h2 className={["label", styles["section"]].join(" ")}>
          <button
            type="button"
            className={["with-icon", styles["fold"]].join(" ")}
            aria-expanded={open}
            aria-controls={id}
            onClick={() => {
              setOpen(!open);
            }}
          >
            <Icon name="chevron" size="s" />
            {name}
          </button>
        </h2>
        {action}
      </Cluster>
      <div id={id} hidden={!open}>
        {children}
      </div>
    </Stack>
  );
}

export interface RoomSectionsProps {
  sections: Rooms["sections"];
  current: string | undefined;
  /** What says the rooms could not load, in their place (CR8). */
  failed?: ReactNode;
  /** What a room holds unseen, at the end of its item: none for none. */
  badge?: ((room: string) => NavItemProps["badge"]) | undefined;
  /** A control at the end of the first section's name: the Earth's New room, as Slack's "+" by its channels. */
  action?: ReactNode;
}

// Who is in a room now, at its row's end as a person and a figure (Alexis, 2026-11-08: "le 1 here est moche"); its messages of the
// last day said with it to a screen reader alone, the list's order already showing the busiest first.
const hereOf = (here: number | undefined, messages: number | undefined) =>
  here === undefined || here <= 0
    ? undefined
    : {
        icon: "people" as const,
        value: String(here),
        said: [`${String(here)} here`, messages === undefined ? "" : `${String(messages)} messages in 24 h`]
          .filter((part) => part !== "")
          .join(", "),
      };

export function RoomSections({ sections, current, failed, badge, action }: RoomSectionsProps) {
  const full = useFull();
  // A room with no address (a realm world's) is listed only as the one in view, which is where one is: no link.
  const shown = sections
    .map((section) => ({
      ...section,
      rooms: section.rooms.flatMap((each) => {
        const to = roomHref(each.room, full);
        return to === undefined && each.room !== current ? [] : [{ ...each, to }];
      }),
    }))
    .filter(({ rooms }) => rooms.length > 0);
  if (failed !== undefined) return failed;
  if (shown.length === 0) return <p>No room here yet.</p>;
  return (
    <Stack space="m">
      {shown.map(({ name, rooms }, at) => (
        <Folding key={name ?? ""} name={name ?? "Rooms"} action={at === 0 ? action : undefined}>
          <ul className={[shared["plain"], shared["items"]].join(" ")}>
            {rooms.map(({ room, here, messages, to }) => (
              <li key={room}>
                <NavItem
                  {...(to === undefined ? { onClick: () => undefined } : { href: to })}
                  current={room === current}
                  badge={badge?.(room)}
                  meta={hereOf(here, messages)}
                  lead={<Icon name="hash" />}
                >
                  {roomLabel(room).replace(/^#/, "")}
                </NavItem>
              </li>
            ))}
          </ul>
        </Folding>
      ))}
    </Stack>
  );
}

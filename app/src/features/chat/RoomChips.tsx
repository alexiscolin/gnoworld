// The docked chat's rooms as chips under its header (the video's frame 26), on one line (D13016): the room in view, those holding unseen
// lines, the most active, as many as the row's width holds, and a last "+N" chip that opens the rooms' view the header's name opens. One link
// to each, the one in view cream, a count after the one that holds something unseen, a "+" to make one for an account on the Earth.
// The full chat has its column, a phone its drawer; this row is the dock's.
import type { RoomList } from "@gnoworld/schemas";
import { Chip, Cluster } from "@gnoworld/ui";
import { useLayoutEffect, useRef, useState } from "react";
import { askFor } from "../../pageAsks.ts";
import { useFull } from "./full.ts";
import { NewRoom, useMayMakeRoom } from "./NewRoom.tsx";
import { distinctLabels, roomHref } from "./names.ts";
import { chipsFit, pickRooms } from "./roomChipsPick.ts";
import { badged } from "./unread.ts";
import styles from "./RoomChips.module.css";

export interface RoomChipsProps {
  sections: RoomList["sections"];
  current: string | undefined;
  /** What each room holds unseen; none for none. */
  badges?: Readonly<Record<string, number>> | undefined;
}

// What the "+N" chip takes before it is drawn once.
const MORE = 56;

// How many of the row's chips its width holds, read again as the row's width changes: none while unmeasured, so every chip is drawn.
function useFitting(shown: boolean, said: string) {
  const rowRef = useRef<HTMLElement>(null);
  const [fit, setFit] = useState<number>();
  useLayoutEffect(() => {
    const list = rowRef.current?.querySelector("ul");
    if (!list) return;
    const read = () => {
      const chips = [...list.querySelectorAll<HTMLElement>("[data-chip]")].map((chip) => chip.offsetWidth);
      const gap = parseFloat(getComputedStyle(list).columnGap) || 0;
      const make = list.querySelector<HTMLElement>("[data-make]");
      const more = list.querySelector<HTMLElement>("[data-more]");
      const room = list.clientWidth - (make ? make.offsetWidth + gap : 0);
      setFit(room > 0 ? chipsFit(chips, { room, gap, more: more?.offsetWidth ?? MORE }) : undefined);
    };
    read();
    const watch = new ResizeObserver(read);
    watch.observe(list);
    return () => {
      watch.disconnect();
    };
  }, [shown, said]);
  return { rowRef, fit };
}

export function RoomChips({ sections, current, badges }: RoomChipsProps) {
  const full = useFull();
  const make = useMayMakeRoom(sections);
  // A room with no address (a realm world's) is no shortcut.
  const links = new Map(
    sections.flatMap((section) =>
      section.rooms.flatMap(({ room }) => {
        const to = roomHref(room, full);
        return to === undefined ? [] : [[room, to] as const];
      }),
    ),
  );
  const listed = sections.flatMap((section) => section.rooms).filter(({ room }) => links.has(room));
  const rooms = pickRooms(listed, current, badges);
  const labels = distinctLabels(listed);
  // One room is the header's name already: the row shows a choice, or nothing (Alexis, 2026-11-07: "pas besoin de doublon").
  const drawn = listed.length >= 2 || make;
  const { rowRef, fit } = useFitting(drawn, rooms.map((room) => `${room}${String(badges?.[room])}`).join());
  if (!drawn) return null;
  const shown = fit ?? rooms.length;
  const left = links.size - shown;
  return (
    <nav ref={rowRef} aria-label="Room shortcuts" className={`held-top ${String(styles["row"])}`}>
      <Cluster as="ul" space="2xs" wrap="no">
        {rooms.map((room, index) => {
          const unseen = badged(badges?.[room]);
          return (
            // A chip the width does not hold fades out where it stands and is no stop for the keyboard; it comes back the same way.
            <li key={room} data-chip="" data-away={index < shown ? undefined : ""} inert={index >= shown}>
              <Chip
                href={links.get(room) ?? ""}
                size="chip"
                selected={room === current}
                {...(unseen?.count === undefined ? {} : { count: unseen.count })}
                {...(unseen === undefined ? {} : { label: `${labels.get(room) ?? room}, ${unseen.said}` })}
              >
                {labels.get(room) ?? room}
              </Chip>
            </li>
          );
        })}
        {left > 0 ? (
          <li data-more="">
            <Chip
              size="chip"
              popup="dialog"
              label={`${String(left)} more ${left === 1 ? "room" : "rooms"}`}
              onClick={() => {
                askFor("rooms");
              }}
            >{`+${String(left)}`}</Chip>
          </li>
        ) : null}
        {make ? (
          <li data-make="">
            <NewRoom />
          </li>
        ) : null}
      </Cluster>
    </nav>
  );
}

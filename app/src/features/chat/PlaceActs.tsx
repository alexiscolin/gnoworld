// The place's own buttons in the chat's header (Alexis, 2026-11-07: "Who's here et Events devraient être des boutons à côté, ça ne fait
// rien dans le chat"): search in the chat, who is here, the place's events and a video call, the last two greyed until they come (D13995).
// The header is one line (Alexis, 2026-11-12): where its width does not hold them all, the last ones leave into a "More" menu, the
// video call and the events first, then the people, then the search (`LEAVING`); the expand button never leaves (ChatHeader.tsx).
import { ComingSoon, IconButton, Menu, type IconName } from "@gnoworld/ui";
import { createContext, use } from "react";
import { useControlSize } from "./full.ts";

/** One of the place's buttons, in the order they stand: `onSelect` none says it is greyed, to come. */
export interface Act {
  label: string;
  icon: IconName;
  onSelect?: () => void;
}

/** What the header's width leaves the buttons, in px, and the size of one and the step between two: none where all of them stand. */
export interface ActsRoom {
  room: number;
  size: number;
  gap: number;
}
export const ActsRoomContext = createContext<ActsRoom | undefined>(undefined);

/** How many of `count` acts a row of `room` px holds: all of them, else the menu's button takes one slot and the rest of the room is the
 * acts' (none at the least). */
export function actsShown({ room, size, gap }: ActsRoom, count: number): number {
  const slots = Math.floor((room + gap) / (size + gap));
  return slots >= count ? count : Math.max(0, slots - 1);
}

/** The place's buttons at the controls' height, those the header's width does not hold under a "More" menu. */
export function PlaceActs({ acts }: { acts: readonly Act[] }) {
  const size = useControlSize();
  const fit = use(ActsRoomContext);
  const shown = fit === undefined ? acts.length : actsShown(fit, acts.length);
  const row = acts.slice(0, shown);
  const more = acts.slice(shown);
  return (
    <>
      {row.map(({ label, icon, onSelect }) =>
        onSelect === undefined ? (
          <ComingSoon key={label} name={label} icon={icon} size={size} />
        ) : (
          <IconButton key={label} icon={icon} label={label} size={size} onClick={onSelect} />
        ),
      )}
      {more.length === 0 ? null : (
        <Menu
          trigger="More"
          label="More of the place"
          icon="more"
          size={size}
          items={more.map(({ label, icon, onSelect }) =>
            onSelect === undefined ? { label, icon, soon: true } : { label, icon, onSelect },
          )}
        />
      )}
    </>
  );
}

/** The place's acts: search in the chat, then who is here, the events and the video call. */
export const placeActs = (search: Act, onWhoIsHere: () => void): Act[] => [
  search,
  { label: "Who's here", icon: "people", onSelect: onWhoIsHere },
  { label: "Events", icon: "calendar" },
  { label: "Video call", icon: "video" },
];

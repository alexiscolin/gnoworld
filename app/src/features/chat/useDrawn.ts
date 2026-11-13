import type { RoomList } from "@gnoworld/schemas";
import { useState } from "react";
import type { ChatPlace } from "./ChatScreen.tsx";
import { shownRoom } from "./names.ts";

/** What the chat draws: a world's place, its rooms and the room in view. */
interface Drawn {
  world: string;
  place: ChatPlace;
  sections: RoomList["sections"] | undefined;
  current: string | undefined;
}

const sameAs = (a: Drawn, b: Drawn): boolean =>
  a.world === b.world && a.place === b.place && a.sections === b.sections && a.current === b.current;

/** What to draw as `asked`, the rooms of `want`'s world, comes: a world whose rooms are not listed yet leaves the chat as the world before
 * drew it, which changes in place once they come, never gives way to a skeleton (the header, the column and the lines stay). */
export function useDrawn(
  asked: { loaded: boolean; sections: RoomList["sections"] | undefined },
  want: { world: string; place: ChatPlace; room: string | null },
): { shown: Drawn; loaded: boolean } {
  const { world, place, room } = want;
  const { sections } = asked;
  const wanted: Drawn = {
    world,
    place,
    sections,
    current: sections === undefined ? undefined : shownRoom(world, sections, room),
  };
  const [drawn, setDrawn] = useState<Drawn>();
  // Adjusted as it renders, never after (react.dev, "you might not need an effect").
  if (asked.loaded && sections !== undefined && (drawn === undefined || !sameAs(drawn, wanted))) setDrawn(wanted);
  const kept = asked.loaded ? undefined : drawn;
  return { shown: kept ?? wanted, loaded: kept !== undefined || asked.loaded };
}

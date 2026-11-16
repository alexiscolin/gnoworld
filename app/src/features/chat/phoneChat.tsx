// What a phone's full chat adds to its screen: the header (Rooms, name, acts, Info), the place band under it (the planet and the key info,
// folded while the lines are scrolled up), the Info sheet and the screen sized to the visual viewport. Its code is a phone's alone (ChatScreen
// asks it once the window is one): a computer's chat never carries it. The sheet holds nothing while shut; the planet's code is the band's lazy one.
import type { ComponentProps, RefObject } from "react";
import { PhoneHeader, type PhoneHeaderProps } from "./PhoneHeader.tsx";
import { PhoneInfo } from "./PhoneInfo.tsx";
import { PhoneBand } from "./PhoneBand.tsx";
import { useLinesFold } from "./bandFold.ts";
import { useSheet } from "./phoneSheet.ts";
import { useViewport } from "./viewport.ts";

type Sheet = Omit<ComponentProps<typeof PhoneInfo>, "open" | "paged" | "onPage" | "onClose">;

/** The phone's header and band. The sheets are the address's (phoneSheet.ts), so Back closes them one by one and a move to another page closes
 * them. The screen is the visual viewport's size meanwhile. */
export function PhoneTop({
  header,
  info,
  present,
  screen,
}: {
  header: Pick<PhoneHeaderProps, "title" | "menu" | "mark" | "rooms" | "acts">;
  info: Sheet;
  /** How many have the room open, in the band. */
  present?: number | undefined;
  screen: RefObject<HTMLElement | null>;
}) {
  const folded = useLinesFold(screen);
  useViewport(screen, true);
  const { sheet, move } = useSheet();
  return (
    <>
      <PhoneHeader
        {...header}
        onInfo={() => {
          move("info");
        }}
      />
      <PhoneBand
        place={info.place}
        talking={info.talking}
        present={present}
        folded={folded}
        onPage={() => {
          move("page");
        }}
      />
      <PhoneInfo
        {...info}
        open={sheet !== undefined}
        paged={sheet === "page"}
        onPage={(paged) => {
          move(paged ? "page" : "info");
        }}
        onClose={() => {
          move(undefined);
        }}
      />
    </>
  );
}

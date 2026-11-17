// What a phone's full chat adds to its screen: the place band (the planet and the key info as one press to Info, folded while the lines are
// scrolled up) with the rooms' row in it (the drawer's control, the chips, the search), the Info sheet and the screen sized to the visual viewport. Its code is a phone's alone (ChatScreen
// asks it once the window is one): a computer's chat never carries it. The sheet holds nothing while shut; the planet's code is the band's lazy one.
import type { ComponentProps, ReactNode, RefObject } from "react";
import { PhoneHeader, type PhoneHeaderProps } from "./PhoneHeader.tsx";
import { PhoneInfo } from "./PhoneInfo.tsx";
import { PhoneBand } from "./PhoneBand.tsx";
import { useLinesFold } from "./bandFold.ts";
import { useSheet } from "./phoneSheet.ts";
import { useViewport } from "./viewport.ts";

type Header = Pick<PhoneHeaderProps, "rooms" | "chips" | "search">;
type Sheet = Omit<ComponentProps<typeof PhoneInfo>, "open" | "onClose">;

/** The phone's band and its rooms' row. The sheets are the address's (phoneSheet.ts), so Back closes them one by one and a move to another page closes
 * them. The screen is the visual viewport's size meanwhile. */
export function PhoneTop({
  header,
  info,
  present,
  screen,
}: {
  header: Header & { title: ReactNode; mark?: ReactNode };
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
      <PhoneBand
        place={info.place}
        title={header.title}
        mark={header.mark}
        talking={info.talking}
        present={present}
        folded={folded}
        onInfo={() => {
          move("page");
        }}
      >
        <PhoneHeader rooms={header.rooms} chips={header.chips} search={header.search} />
      </PhoneBand>
      <PhoneInfo
        {...info}
        open={sheet !== undefined}
        onClose={() => {
          move(undefined);
        }}
      />
    </>
  );
}

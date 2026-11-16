// What a phone's full chat adds to its screen: the header (back, name, Rooms, acts, Info), the Info sheet it opens and the screen sized to
// the visual viewport. Its code is a phone's alone (ChatScreen asks it once the window is one): a computer's chat never carries it. The
// sheet holds nothing while shut; the planet's code is PlaceView's lazy one, asked once the sheet is open.
import type { ComponentProps, RefObject } from "react";
import { PhoneHeader, type PhoneHeaderProps } from "./PhoneHeader.tsx";
import { PhoneInfo } from "./PhoneInfo.tsx";
import { useChatBack } from "./phoneGo.ts";
import { useSheet } from "./phoneSheet.ts";
import { useViewport } from "./viewport.ts";

type Sheet = Omit<ComponentProps<typeof PhoneInfo>, "open" | "paged" | "onPage" | "onClose">;

/** The phone's header. The sheets are the address's (phoneSheet.ts), so Back closes them one by one and a move to another page closes
 * them. The screen is the visual viewport's size meanwhile. */
export function PhoneTop({
  header,
  info,
  screen,
}: {
  header: Pick<PhoneHeaderProps, "title" | "menu" | "mark" | "rooms" | "acts">;
  info: Sheet;
  screen: RefObject<HTMLElement | null>;
}) {
  const back = useChatBack();
  useViewport(screen, true);
  const { sheet, move } = useSheet();
  return (
    <>
      <PhoneHeader
        {...header}
        onBack={back}
        onInfo={() => {
          move("info");
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

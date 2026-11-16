// What a phone's full chat adds to its screen: the header (back, name, Rooms, acts, Info), the Info sheet it opens and the screen sized to
// the visual viewport. Its code is a phone's alone (ChatScreen asks it once the window is one): a computer's chat never carries it. The
// sheet holds nothing while shut; the planet's code is PlaceView's lazy one, asked once the sheet is open.
import { useState, type ComponentProps, type RefObject } from "react";
import { useLocation } from "react-router";
import { PhoneHeader, type PhoneHeaderProps } from "./PhoneHeader.tsx";
import { PhoneInfo } from "./PhoneInfo.tsx";
import { useChatBack } from "./phoneGo.ts";
import { useViewport } from "./viewport.ts";

type Sheet = Omit<ComponentProps<typeof PhoneInfo>, "open" | "onClose">;

/** The phone's header. The Info sheet is open at the page it was opened on (its path and query: a link to a place in the page, which
 * changes only the hash, leaves it open), so a move to another page closes it. The screen is the visual viewport's size meanwhile. */
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
  const { pathname, search } = useLocation();
  const key = pathname + search;
  const [at, setAt] = useState<string>();
  return (
    <>
      <PhoneHeader
        {...header}
        onBack={back}
        onInfo={() => {
          setAt(key);
        }}
      />
      <PhoneInfo
        {...info}
        open={at === key}
        onClose={() => {
          setAt(undefined);
        }}
      />
    </>
  );
}

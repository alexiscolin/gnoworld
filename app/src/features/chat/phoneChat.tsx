// What a phone's full chat adds to its screen: the header (back, name, Rooms, acts, Info) and the Info sheet it opens. The sheet is a
// static import (Info, PlaceInfo and PlaceView are the screen's already) and holds nothing while shut; the planet's code is PlaceView's
// lazy one, asked once the sheet is open.
import { useState, type ComponentProps } from "react";
import { useLocation } from "react-router";
import { ChatHeader, type ChatHeaderProps } from "./ChatHeader.tsx";
import { PhoneHeader, type PhoneHeaderProps } from "./PhoneHeader.tsx";
import { PhoneInfo } from "./PhoneInfo.tsx";
import { useChatBack } from "./phoneGo.ts";

type Sheet = Omit<ComponentProps<typeof PhoneInfo>, "open" | "onClose">;

/** The chat's header: a phone's, or the wide chat's and the dock's. The phone's Info sheet is open at the page it was opened on (its path
 * and query: a link to a place in the page, which changes only the hash, leaves it open), so a move to another page closes it. */
export function useHeader({
  phone,
  desktop,
  phoneOf: { header, info },
}: {
  phone: boolean;
  desktop: ChatHeaderProps;
  phoneOf: { header: Pick<PhoneHeaderProps, "title" | "menu" | "mark" | "rooms" | "acts">; info: Sheet };
}) {
  const back = useChatBack();
  const { pathname, search } = useLocation();
  const key = pathname + search;
  const [at, setAt] = useState<string>();
  return {
    header: phone ? (
      <PhoneHeader
        {...header}
        onBack={back}
        onInfo={() => {
          setAt(key);
        }}
      />
    ) : (
      <ChatHeader {...desktop} />
    ),
    sheet: phone ? (
      <PhoneInfo
        {...info}
        open={at === key}
        onClose={() => {
          setAt(undefined);
        }}
      />
    ) : null,
  };
}

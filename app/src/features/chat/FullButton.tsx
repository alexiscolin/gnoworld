// The button that moves the chat between its dock and the full screen: outward arrows in the dock open the full chat, inward arrows in the full
// chat close it, back to the page with its chat docked. Both are the header's ways' own moves (fullChat.ts), the same links.
import { PHONE_QUERY } from "@gnoworld/core";
import { IconButton } from "@gnoworld/ui";
import { useLocation, useNavigate } from "react-router";
import { fullChatHref, leaveDock, withoutFull } from "../../fullChat.ts";
import { useControlSize } from "./full.ts";
import { useChatBack } from "./phoneGo.ts";
import { useMedia } from "./useMedia.ts";

/** Opens the full chat of the page (`full` false: in the dock) or closes it (`full`), the dock's box taken for the move between the two. */
export function FullButton({ full }: { full: boolean }) {
  const navigate = useNavigate();
  const { pathname, search } = useLocation();
  const size = useControlSize();
  // A phone has no page of the place to close to (it would send the chat straight back): it goes back as the browser does.
  const phone = useMedia(PHONE_QUERY);
  const back = useChatBack();
  return (
    <IconButton
      icon={full ? "shrink" : "expand"}
      label={full ? "Close the full chat" : "Open the full chat"}
      size={size}
      onClick={() => {
        if (full && phone) {
          back();
          return;
        }
        if (!full) leaveDock();
        const to = full ? withoutFull(pathname, new URLSearchParams(search)) : fullChatHref(`${pathname}${search}`);
        Promise.resolve(navigate(to)).catch(reportError);
      }}
    />
  );
}

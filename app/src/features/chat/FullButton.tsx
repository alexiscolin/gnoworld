// The button that moves the chat between its dock and the full screen: outward arrows in the dock open the full chat, inward arrows in the full
// chat close it, back to the page with its chat docked. Both are the header's ways' own moves (fullChat.ts), the same links.
import { IconButton } from "@gnoworld/ui";
import { useLocation, useNavigate } from "react-router";
import { fullChatHref, leaveDock, withoutFull } from "../../fullChat.ts";
import { useControlSize } from "./full.ts";

/** Opens the full chat of the page (`full` false: in the dock) or closes it (`full`), the dock's box taken for the move between the two. */
export function FullButton({ full }: { full: boolean }) {
  const navigate = useNavigate();
  const { pathname, search } = useLocation();
  const size = useControlSize();
  return (
    <IconButton
      icon={full ? "shrink" : "expand"}
      label={full ? "Close the full chat" : "Open the full chat"}
      size={size}
      onClick={() => {
        if (!full) leaveDock();
        const to = full ? withoutFull(pathname, new URLSearchParams(search)) : fullChatHref(`${pathname}${search}`);
        Promise.resolve(navigate(to)).catch(reportError);
      }}
    />
  );
}

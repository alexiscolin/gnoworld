// The place's own buttons in the chat's header (Alexis, 2026-11-07: "Who's here et Events devraient être des boutons à côté, ça ne fait
// rien dans le chat"): who is here, which takes the reader to the people; the place's events and a video call, greyed until they come
// (D13995: no event to show yet, the calls a later slice's). The pills over the composer keep what acts in the conversation.
import { ComingSoon, IconButton } from "@gnoworld/ui";
import { useControlSize } from "./full.ts";

/** Who is here, then the events and the video call to come, at the controls' height beside them. */
export function PlaceButtons({ onWhoIsHere }: { onWhoIsHere: () => void }) {
  const size = useControlSize();
  return (
    <>
      <IconButton icon="people" label="Who's here" size={size} onClick={onWhoIsHere} />
      <ComingSoon name="Events" icon="calendar" size={size} />
      <ComingSoon name="Video call" icon="video" size={size} />
    </>
  );
}

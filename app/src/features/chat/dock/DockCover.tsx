// The dock's skeleton, standing over its chat from the page's first draw till the chat is connected (or a bound passes), then fading out over it:
// the chat's own parts (its header, its rooms, its "Connecting to the chat…") come and change under it, and what shows goes from the skeleton to
// the settled chat in one cross-fade, never a swap from one state to the next.
import { useEffect, useState } from "react";
import styles from "./DockCover.module.css";
import { LoadingShape } from "./Loading.tsx";

// What the connected chat says of itself (RoomView.tsx), and the longest the cover waits for it.
const SETTLED = "#chat [data-chat-state='connected']";
const BOUND_MS = 3500;

/** The skeleton over the dock; it leaves itself once the chat under it has settled, or the bound has passed unless the chat is `waiting`
 * to be made: an empty dock is never left standing. */
export function DockCover({ waiting = false }: { waiting?: boolean }) {
  const [leaving, setLeaving] = useState(false);
  const [gone, setGone] = useState(false);
  useEffect(() => {
    const leave = (): void => {
      setLeaving(true);
    };
    const watch = new MutationObserver(() => {
      if (document.querySelector(SETTLED) !== null) leave();
    });
    watch.observe(document.body, {
      childList: true,
      subtree: true,
      attributes: true,
      attributeFilter: ["data-chat-state"],
    });
    const timer = waiting ? undefined : setTimeout(leave, BOUND_MS);
    return () => {
      watch.disconnect();
      clearTimeout(timer);
    };
  }, [waiting]);
  useEffect(() => {
    if (!leaving) return undefined;
    const timer = setTimeout(() => {
      setGone(true);
    }, 800);
    return () => {
      clearTimeout(timer);
    };
  }, [leaving]);
  if (gone) return null;
  return (
    <div
      className={styles["cover"]}
      data-dock-cover=""
      data-leaving={leaving ? "" : undefined}
      aria-hidden="true"
      onTransitionEnd={
        leaving
          ? () => {
              setGone(true);
            }
          : undefined
      }
    >
      <LoadingShape />
    </div>
  );
}

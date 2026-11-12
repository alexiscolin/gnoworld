// The full chat's skeleton, drawn as soon as the page has code and kept over the chat till it has faded in (FullChatHost): the chat's own
// layout (ui's ChatLayout, so its regions stand where the chat's will) filled with shapes of the header, the worlds, the rooms, the lines, the
// composer and the info panel; it fades out over the chat as the chat comes, never a jump of layout.
import { ChatLayout, Cluster, Skeleton, Stack } from "@gnoworld/ui";
import { useEffect, useState } from "react";
import styles from "./FullLoading.module.css";
import { Bar, SkeletonLines } from "./SkeletonBits.tsx";
import { useMedia } from "./useMedia.ts";

const ROOMS = [
  ["a", "mid"],
  ["b", "long"],
  ["c", "short"],
  ["d", "mid"],
  ["e", "long"],
  ["f", "short"],
] as const;
const WORLDS = ["a", "b", "c", "d", "e", "f", "g"] as const;
// The longest the skeleton stays once the chat is there, a word of the fade's end that never comes (a still screen).
const LEFT_MS = 800;
// Under this width the chat keeps no rooms or info column (ChatScreen.tsx's NARROW).
const NARROW = "(max-width: 899px)";

const disc = <Skeleton shape="disc" />;

const header = (
  <Cluster as="div" space="s">
    {disc}
    <Bar width="short" />
  </Cluster>
);

const worlds = (
  <div className={styles["worlds"]}>
    <Stack space="s">
      {WORLDS.map((key) => (
        <span key={key}>{disc}</span>
      ))}
    </Stack>
  </div>
);

const rooms = (
  <div className={styles["rooms"]}>
    <Stack space="s">
      <Bar width="mid" />
      {ROOMS.map(([key, width]) => (
        <Cluster key={key} space="2xs">
          {disc}
          <Bar width={width} />
        </Cluster>
      ))}
    </Stack>
  </div>
);

const info = (
  <div className={styles["info"]}>
    <Stack space="m">
      <Cluster space="xs">
        {disc}
        <Bar width="mid" />
      </Cluster>
      <Skeleton lines={3} />
      <Skeleton shape="card" />
    </Stack>
  </div>
);

const lines = (
  <div className={styles["lines"]}>
    <SkeletonLines />
  </div>
);

// The chat's own screen once it is drawn under the skeleton, or the failure that stands in its place (a visitor's rooms that did not load).
const DRAWN = "[data-full]:not([data-chat-skeleton]), [data-chat-failed]";

/** The skeleton of the full chat, over the page; it fades out as the chat's screen is drawn under it, and `onGone` tells when it has. */
export function FullLoading({ onGone }: { onGone: () => void }) {
  const narrow = useMedia(NARROW);
  // A screen already drawn when this stands has no mutation left to wait for.
  const [leaving, setLeaving] = useState(() => document.querySelector(DRAWN) !== null);
  useEffect(() => {
    if (leaving) return undefined;
    const watch = new MutationObserver(() => {
      if (document.querySelector(DRAWN) !== null) setLeaving(true);
    });
    watch.observe(document.body, { childList: true, subtree: true });
    return () => {
      watch.disconnect();
    };
  }, [leaving]);
  useEffect(() => {
    if (!leaving) return undefined;
    const timer = setTimeout(onGone, LEFT_MS);
    return () => {
      clearTimeout(timer);
    };
  }, [leaving, onGone]);
  return (
    <div
      className={styles["shape"]}
      data-chat-skeleton=""
      data-full=""
      data-compact={narrow ? "" : undefined}
      data-leaving={leaving ? "" : undefined}
      aria-hidden="true"
      onAnimationEnd={
        leaving
          ? (event) => {
              if (event.target === event.currentTarget) onGone();
            }
          : undefined
      }
    >
      <ChatLayout header={header} worlds={worlds} rooms={narrow ? undefined : rooms} info={narrow ? undefined : info}>
        <div className={styles["conversation"]}>
          {lines}
          <div className={styles["composer"]}>
            <Skeleton shape="card" />
          </div>
        </div>
      </ChatLayout>
    </div>
  );
}

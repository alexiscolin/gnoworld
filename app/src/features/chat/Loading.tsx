// What the chat shows while its rooms load: the chat's own shape at its size, so nothing moves as it comes (the header's row,
// the room's name and chips, and a few lines of a face, a name and words), the words for a screen reader alone. The build's
// pre-render and the hydration draw the words alone: a page's boundary past 12.8 KB is sent apart by a script its policy
// refuses (csp.ts). The shape follows at once, as the page runs. The chat, not its rooms: a direct message waits on them too (U10).
import { Cluster, Skeleton, Stack } from "@gnoworld/ui";
import { useSyncExternalStore } from "react";
import styles from "./Loading.module.css";
import { Bar, SkeletonLines } from "./SkeletonBits.tsx";

const shape = (
  <Stack space="m">
    <Cluster as="header" space="xs">
      <Skeleton shape="disc" />
      <Bar width="short" />
    </Cluster>
    <Bar width="mid" />
    <Cluster space="2xs">
      <Bar width="chip" />
      <Bar width="chip" />
      <Bar width="chip" />
    </Cluster>
    <SkeletonLines />
  </Stack>
);

const unchanging = () => () => undefined;

/** The chat's shape alone, said by no one: what stands over a chat that says its own loading (DockCover.tsx). */
export function LoadingShape() {
  const running = useSyncExternalStore(
    unchanging,
    () => true,
    () => false,
  );
  return (
    <div className={styles["chat"]} aria-hidden="true">
      {running ? shape : null}
    </div>
  );
}

function Loading() {
  const running = useSyncExternalStore(
    unchanging,
    () => true,
    () => false,
  );
  return (
    <div className={styles["chat"]} aria-busy="true">
      <div className="visually-hidden">
        <p role="status">Loading the chat…</p>
      </div>
      {running ? shape : null}
    </div>
  );
}

export const LOADING = <Loading />;

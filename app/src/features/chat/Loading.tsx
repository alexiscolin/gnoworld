// What the chat shows while its rooms load: the chat's own shape at its size, so nothing moves as it comes (the header's row,
// the room's name and chips, and a few lines of a face, a name and words), the words for a screen reader alone. The build's
// pre-render and the hydration draw the words alone: a page's boundary past 12.8 KB is sent apart by a script its policy
// refuses (csp.ts). The shape follows at once, as the page runs. The chat, not its rooms: a direct message waits on them too (U10).
import { Cluster, Skeleton, Stack } from "@gnoworld/ui";
import { useSyncExternalStore } from "react";
import styles from "./Loading.module.css";

// Each line's name, and its words' bars, by width.
const LINES = [
  ["mid", ["long"]],
  ["short", ["full", "mid"]],
  ["mid", ["long", "short"]],
  ["long", ["mid"]],
  ["short", ["full"]],
  ["mid", ["long", "mid"]],
] as const;

const WIDTHS = {
  chip: styles["chip"],
  short: styles["short"],
  mid: styles["mid"],
  long: styles["long"],
  full: styles["full"],
};

const Bar = ({ width }: { width: keyof typeof WIDTHS }) => (
  <span className={WIDTHS[width]}>
    <Skeleton />
  </span>
);

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
    <Stack space="s">
      {LINES.map(([name, words]) => (
        <Stack key={`${name}${words.join("")}`} space="3xs">
          <Cluster space="2xs">
            <Skeleton shape="disc" />
            <Bar width={name} />
          </Cluster>
          {words.map((width) => (
            <Bar key={width} width={width} />
          ))}
        </Stack>
      ))}
    </Stack>
  </Stack>
);

const unchanging = () => () => undefined;

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

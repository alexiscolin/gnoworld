// The bars and the lines of a chat's skeleton, shared by the docked chat's (Loading.tsx) and the full chat's (FullLoading.tsx).
import { Cluster, Skeleton, Stack } from "@gnoworld/ui";
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

export const Bar = ({ width }: { width: keyof typeof WIDTHS }) => (
  <span className={WIDTHS[width]}>
    <Skeleton />
  </span>
);

/** A few lines of a face, a name and words. */
export const SkeletonLines = () => (
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
);

// The line under a realm's or a world's title that says in two plain sentences what it is, written by Jarvis from the realm's code alone and marked
// so: its mark, the line drawn as text, a skeleton while it is being made, and the page's own first line (`fallback`) when there is none.
import { Icon, Panel, Skeleton } from "@gnoworld/ui";
import type { ReactNode } from "react";
import styles from "./Explained.module.css";
import { useExplanation, type Explained as Of } from "./useExplanation.ts";

export function Explained({ of, fallback }: { of: Of; fallback: ReactNode }) {
  const explanation = useExplanation(of);
  if (explanation?.status === "making") {
    return (
      <div aria-busy="true" aria-label="Jarvis is reading its code">
        <Panel.Lede>
          <Skeleton lines={2} />
        </Panel.Lede>
      </div>
    );
  }
  if (explanation?.status !== "ready") return fallback;
  // The mark ends the line, in its run of words, so nothing stands between the line and what is under it.
  return (
    <Panel.Lede>
      {explanation.text}{" "}
      <span className={styles["mark"]}>
        <Icon name="spark" size="s" /> Jarvis · from its code
      </span>
    </Panel.Lede>
  );
}

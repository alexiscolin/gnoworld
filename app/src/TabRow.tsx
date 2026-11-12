// The row under a dialog's title: its figures at the start, its tabs at the end, and the line a tab's card says when it holds nothing.
import { Cluster } from "@gnoworld/ui";
import type { ReactNode } from "react";
import styles from "./TabRow.module.css";

export function TabRow({ figures, tabs }: { figures: ReactNode; tabs: ReactNode }) {
  return (
    <Cluster justify="between" space="m">
      {figures}
      <div className={styles["tabs"]}>{tabs}</div>
    </Cluster>
  );
}

export function Note({ children }: { children: ReactNode }) {
  return <p className={styles["note"]}>{children}</p>;
}

/** The place of a figure not read yet, as wide as a figure. */
export function PendingFigure({ children }: { children: ReactNode }) {
  return <div className={styles["pending"]}>{children}</div>;
}

/** The place of a card not read yet, as tall as `like` once read: a chart's or a list's. */
export function PendingCard({ like, children }: { like: "chart" | "list"; children: ReactNode }) {
  return <div className={like === "chart" ? styles["chart"] : styles["list"]}>{children}</div>;
}

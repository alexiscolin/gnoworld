// The room's column of lines and composer (slice 4's 4d threads, apart from RoomView.tsx): hidden in a narrow room while
// a thread's panel is open, which takes its place (RoomView.module.css).
import type { ReactNode } from "react";
import styles from "./RoomView.module.css";

export function RoomMain({ threaded, children }: { threaded: boolean | undefined; children: ReactNode }) {
  return (
    <div className={styles["main"]} data-threaded={threaded === true ? "" : undefined}>
      {children}
    </div>
  );
}

import { IconButton, Sidebar } from "@gnoworld/ui";
import { useEffect, useRef } from "react";
import styles from "./Thread.module.css";

// The panel's place while its code comes, or when it could not: a word and Close, which a narrow room needs, as the
// room is hidden while a thread is open (CR3).
export function Standing({ word, close }: { word: string; close: () => void }) {
  const boxRef = useRef<HTMLElement>(null);
  useEffect(() => {
    boxRef.current?.querySelector("button")?.focus();
  }, []);
  return (
    <aside
      ref={boxRef}
      aria-label="Thread"
      className={styles["panel"]}
      onKeyDown={(event) => {
        if (event.key === "Escape" && !event.defaultPrevented) close();
      }}
    >
      <Sidebar side="end" space="2xs">
        <p role="status">{word}</p>
        <IconButton icon="close" label="Close the thread" size="s" emphasis="plain" onClick={close} />
      </Sidebar>
    </aside>
  );
}

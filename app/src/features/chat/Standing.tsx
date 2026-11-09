import { IconButton, Sidebar, Skeleton, Stack } from "@gnoworld/ui";
import { useEffect, useRef } from "react";
import styles from "./Thread.module.css";

// The panel's place while its code comes, or when it could not: a word and Close, which a narrow room needs, as the
// room is hidden while a thread is open (CR3). While it comes (`busy`) the word is for a screen reader alone, and the panel's
// shape, a few lines, stands in its place.
export function Standing({ word, close, busy = false }: { word: string; close: () => void; busy?: boolean }) {
  const boxRef = useRef<HTMLElement>(null);
  useEffect(() => {
    boxRef.current?.querySelector("button")?.focus();
  }, []);
  return (
    <aside
      ref={boxRef}
      aria-label="Thread"
      className={styles["panel"]}
      aria-busy={busy || undefined}
      onKeyDown={(event) => {
        if (event.key === "Escape" && !event.defaultPrevented) close();
      }}
    >
      <Stack space="m">
        <Sidebar side="end" space="2xs">
          {busy ? (
            <div className="visually-hidden">
              <p role="status">{word}</p>
            </div>
          ) : (
            <p role="status">{word}</p>
          )}
          <IconButton icon="close" label="Close the thread" size="s" emphasis="plain" onClick={close} />
        </Sidebar>
        {busy ? <Skeleton lines={2} /> : null}
        {busy ? <Skeleton lines={3} /> : null}
      </Stack>
    </aside>
  );
}

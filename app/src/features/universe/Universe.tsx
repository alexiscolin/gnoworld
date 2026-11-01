// The space behind the page (ADR-0001 §7): a canvas under everything, the 3D's code loaded after the text, or on request. It stays
// mounted once it came, so a page that does not show it only covers it. The places' links stay in the page, with or without the 3D.
import { Button } from "@gnoworld/ui";
import { useEffect, useRef, useState, useSyncExternalStore } from "react";
import { SceneHost } from "./host.ts";
import styles from "./Universe.module.css";

// The button leaves as the scene comes: a focus it held goes to the page's heading, where the reader was. One they took elsewhere stays.
function handOver(button: HTMLElement) {
  const held = document.activeElement;
  if (held === button || held === document.body) document.querySelector("h1")?.focus({ preventScroll: true });
}

export function Universe({ shown }: { shown: boolean }) {
  const [host] = useState(() => new SceneHost());
  const status = useSyncExternalStore(host.subscribe, host.status);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  useEffect(() => (canvasRef.current === null ? undefined : host.attach(canvasRef.current)), [host]);
  useEffect(() => {
    host.show(shown);
  }, [host, shown]);
  return (
    <>
      <canvas
        ref={canvasRef}
        className={styles["canvas"]}
        aria-hidden="true"
        data-scene={shown ? status : "covered"}
        data-opened={status === "on" ? "" : undefined}
      />
      {shown && (status === "offered" || status === "asked") ? (
        <div className={styles["offer"]}>
          <Button
            busy={status === "asked"}
            onClick={({ currentTarget }) => {
              host.press(() => {
                handOver(currentTarget);
              });
            }}
          >
            View in space
          </Button>
        </div>
      ) : null}
      <p role="status" className={styles["status"]}>
        {shown && status === "failed" ? "Space is not available here. Every place is in the list." : null}
      </p>
    </>
  );
}

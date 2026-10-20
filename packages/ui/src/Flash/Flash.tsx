import { useEffect, useEffectEvent, useState } from "react";
import { Button } from "../Button/Button.tsx";
import { IconButton } from "../Button/IconButton.tsx";
import { Cluster, Stack } from "../compositions/index.ts";
import styles from "./Flash.module.css";

export interface FlashMessage {
  title: string;
  line?: string;
  action?: { label: string; onAction: () => void };
}

export interface FlashProps {
  /** What it says; null keeps its region on the page, empty, so what fills it later is announced. The
   * same words are the same flash, whatever object holds them: to say them again, pass null between. */
  message: FlashMessage | null;
  onClose: () => void;
}

// docs/DESIGN-SYSTEM.md, "Motion": 5 s, held while the pointer is over it; with an action, it stays.
const LIFETIME = 5_000;

// The flash itself, on the page while it has something to say: closed, it leaves with its hold, which
// no pointerleave would end.
function Pill({ message, onClose }: { message: FlashMessage; onClose: () => void }) {
  const [held, setHeld] = useState(false);
  const close = useEffectEvent(onClose);
  const { title, line, action } = message;
  const timed = action === undefined && !held;
  // Its words, not its object: the same words in a new object keep their count.
  useEffect(() => {
    if (!timed) return;
    const timer = setTimeout(() => {
      close();
    }, LIFETIME);
    return () => {
      clearTimeout(timer);
    };
  }, [timed, title, line]);
  return (
    <div
      className={styles["flash"]}
      onPointerEnter={() => {
        setHeld(true);
      }}
      onPointerLeave={() => {
        setHeld(false);
      }}
    >
      <Cluster space="m">
        <Stack space="3xs">
          <p className={styles["title"]}>{title}</p>
          {line === undefined ? null : <p className={styles["line"]}>{line}</p>}
        </Stack>
        {action === undefined ? null : (
          <Cluster space="2xs">
            <Button
              size="s"
              onClick={() => {
                action.onAction();
                onClose();
              }}
            >
              {action.label}
            </Button>
            <IconButton icon="close" label="Close" emphasis="plain" size="s" onClick={onClose} />
          </Cluster>
        )}
      </Cluster>
    </div>
  );
}

/** A short note and at most one action, never the cream primary; where it sits is its slot's. */
export function Flash({ message, onClose }: FlashProps) {
  return <div role="status">{message === null ? null : <Pill message={message} onClose={onClose} />}</div>;
}

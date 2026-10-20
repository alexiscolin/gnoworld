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
  /** What it says; null keeps its region on the page, empty, so what fills it later is announced. */
  message: FlashMessage | null;
  onClose: () => void;
}

// docs/DESIGN-SYSTEM.md, "Motion": 5 s, held while the pointer is over it; with an action, it stays.
const LIFETIME = 5_000;

/** A short note and at most one action, never the cream primary; where it sits is its slot's. */
export function Flash({ message, onClose }: FlashProps) {
  const [held, setHeld] = useState(false);
  const close = useEffectEvent(onClose);
  const action = message?.action;
  const timed = message !== null && action === undefined && !held;
  useEffect(() => {
    if (!timed) return;
    const timer = setTimeout(() => {
      close();
    }, LIFETIME);
    return () => {
      clearTimeout(timer);
    };
  }, [timed, message]);
  return (
    <div role="status">
      {message === null ? null : (
        <div
          className={styles["flash"]}
          data-action={action === undefined ? undefined : ""}
          onPointerEnter={() => {
            setHeld(true);
          }}
          onPointerLeave={() => {
            setHeld(false);
          }}
        >
          <Cluster space="m">
            <Stack space="3xs">
              <p className={styles["title"]}>{message.title}</p>
              {message.line === undefined ? null : <p className={styles["line"]}>{message.line}</p>}
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
      )}
    </div>
  );
}

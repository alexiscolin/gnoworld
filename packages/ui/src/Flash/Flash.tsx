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

/** What a flash says, as one value: its count and its hold follow the words, not the object. */
function wordsOf(message: FlashMessage | null) {
  return message === null ? null : [message.title, message.line ?? "", message.action?.label ?? ""].join("\n");
}

/** A short note and at most one action, never the cream primary; where it sits is its slot's. */
export function Flash({ message, onClose }: FlashProps) {
  const action = message?.action;
  const words = wordsOf(message);
  // Held for these words only: a flash closed under the pointer gets no pointerleave, and the next
  // one would stay held.
  const [heldWords, setHeldWords] = useState<string | null>(null);
  const close = useEffectEvent(onClose);
  const timed = words !== null && action === undefined && heldWords !== words;
  useEffect(() => {
    if (!timed) return;
    const timer = setTimeout(() => {
      close();
    }, LIFETIME);
    return () => {
      clearTimeout(timer);
    };
  }, [timed, words]);
  return (
    <div role="status">
      {message === null ? null : (
        <div
          className={styles["flash"]}
          data-action={action === undefined ? undefined : ""}
          onPointerEnter={() => {
            setHeldWords(words);
          }}
          onPointerLeave={() => {
            setHeldWords(null);
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

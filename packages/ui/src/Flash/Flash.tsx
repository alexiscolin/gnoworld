import { useEffect, useEffectEvent, useRef, useState } from "react";
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

// docs/DESIGN-SYSTEM.md, "Motion": 5 s, held while the pointer is over it or the focus in it, each a
// hold of its own; with an action, it stays.
const LIFETIME = 5_000;

// The flash itself, on the page while it has something to say: closed, it leaves with its holds, which
// no pointerleave or blur would end.
function Pill({ message, onClose }: { message: FlashMessage; onClose: () => void }) {
  const [pointed, setPointed] = useState(false);
  const [focused, setFocused] = useState(false);
  // Where the focus was before it came in: closed from its own button, the flash gives it back, where
  // it would otherwise fall to the page.
  const backRef = useRef<HTMLElement | null>(null);
  const close = useEffectEvent(onClose);
  const { title, line, action } = message;
  // It closes before its action acts, so the act may raise the next flash, which a close after would wipe.
  const leave = (button: HTMLElement) => {
    if (document.activeElement === button) backRef.current?.focus();
    onClose();
  };
  const timed = action === undefined && !pointed && !focused;
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
        setPointed(true);
      }}
      onPointerLeave={() => {
        setPointed(false);
      }}
      onFocus={(event) => {
        setFocused(true);
        const from = event.relatedTarget;
        if (from instanceof HTMLElement && !event.currentTarget.contains(from)) backRef.current = from;
      }}
      onBlur={(event) => {
        const to = event.relatedTarget;
        if (!(to instanceof Node && event.currentTarget.contains(to))) setFocused(false);
      }}
    >
      <Cluster space="m">
        <Stack space="3xs">
          <p className={styles["title"]}>{title}</p>
          {line === undefined ? null : <p className={styles["line"]}>{line}</p>}
        </Stack>
        <Cluster space="2xs">
          {action === undefined ? null : (
            <Button
              size="s"
              onClick={(event) => {
                leave(event.currentTarget);
                action.onAction();
              }}
            >
              {action.label}
            </Button>
          )}
          <IconButton
            icon="close"
            label="Close"
            emphasis="plain"
            size="s"
            onClick={(event) => {
              leave(event.currentTarget);
            }}
          />
        </Cluster>
      </Cluster>
    </div>
  );
}

/** A short note and at most one action, never the cream primary; where it sits is its slot's. */
export function Flash({ message, onClose }: FlashProps) {
  return <div role="status">{message === null ? null : <Pill message={message} onClose={onClose} />}</div>;
}

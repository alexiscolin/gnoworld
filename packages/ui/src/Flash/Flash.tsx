import { useEffect, useEffectEvent, useLayoutEffect, useRef, useState } from "react";
import { Button } from "../Button/Button.tsx";
import { IconButton } from "../Button/IconButton.tsx";
import { Cluster, Stack } from "../compositions/index.ts";
import { surface } from "../Popover/floating.ts";
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
  /** An arrival banner (frames 90 to 97): on a wide screen, under the header in the scene's free area, over the scene alone. */
  look?: "arrival" | undefined;
}

// docs/DESIGN-SYSTEM.md, "Motion": 5 s, held while the pointer is over it or the focus in it, each a
// hold of its own; with an action, it stays.
const LIFETIME = 5_000;

// The flash itself, on the page while it has something to say: closed, it leaves with its holds, which
// no pointerleave or blur would end.
function Pill({ message, onClose, look }: FlashProps & { message: FlashMessage }) {
  const [pointed, setPointed] = useState(false);
  // Each move of the focus in or out: it makes the count read again where the focus is.
  const [moves, setMoves] = useState(0);
  const pillRef = useRef<HTMLDivElement>(null);
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
  const moved = () => {
    setMoves((count) => count + 1);
  };
  const timed = action === undefined && !pointed;
  // Its words, not its object, keep their count. The focus holds it where the page has it now: a removed
  // element fires no blur in jsdom (Chromium 156 fires one), so no flag kept by events can say (F316).
  useEffect(() => {
    if (!timed || pillRef.current?.contains(document.activeElement) === true) return;
    const timer = setTimeout(() => {
      close();
    }, LIFETIME);
    return () => {
      clearTimeout(timer);
    };
  }, [timed, title, line, moves]);
  // In the top layer, over a modal dialog's scrim when raised from it (F331), shown as it comes; its
  // region stays in the page, where it is announced.
  useLayoutEffect(() => {
    pillRef.current?.showPopover();
  }, []);
  return (
    <div
      ref={pillRef}
      popover="manual"
      data-stays={action === undefined ? undefined : ""}
      data-look={look}
      className={surface(styles["flash"])}
      onPointerEnter={() => {
        setPointed(true);
      }}
      onPointerLeave={() => {
        setPointed(false);
      }}
      onFocus={(event) => {
        moved();
        // Coming in from outside, from nowhere included, it takes a new way back (F323).
        const from = event.relatedTarget;
        if (!(from instanceof Node && event.currentTarget.contains(from)))
          backRef.current = from instanceof HTMLElement ? from : null;
      }}
      onBlur={moved}
    >
      <Cluster space="m">
        <Stack space="3xs">
          <p className={styles["title"]}>{title}</p>
          {line === undefined ? null : <p className={look === "arrival" ? "label" : styles["line"]}>{line}</p>}
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

/** A short note and at most one action, never the cream primary; shown at the top of the screen. */
export function Flash({ message, onClose, look }: FlashProps) {
  return <div role="status">{message === null ? null : <Pill message={message} onClose={onClose} look={look} />}</div>;
}

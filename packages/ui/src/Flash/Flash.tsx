import { useEffect, useEffectEvent, useLayoutEffect, useRef, useState, type RefObject } from "react";
import { Button } from "../Button/Button.tsx";
import { IconButton } from "../Button/IconButton.tsx";
import { Cluster, Stack } from "../compositions/index.ts";
import { motionWelcome } from "../motion.ts";
import { surface } from "../Popover/floating.ts";
import styles from "./Flash.module.css";
import { stillCopy } from "../stillCopy.ts";

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
  /** An arrival's banner (frames 23, 93): under the header, over the scene, never pushing the page; timed even with its action. */
  banner?: boolean;
}

// docs/DESIGN-SYSTEM.md, "Motion": 5 s, held while the pointer is over it or the focus in it, each a
// hold of its own; with an action, it stays.
const LIFETIME = 5_000;

// Unmounted, a pill leaves by a copy of itself that fades out in its place (React removes the pill in one frame); nothing under reduced motion, nor where
// there is no Web Animations API (jsdom), so a closed flash is gone at once for the tests and a screen reader.
function leaveByCopy(pill: HTMLElement) {
  if (typeof pill.animate !== "function") return;
  if (!motionWelcome()) return;
  const ghost = stillCopy(pill);
  if (ghost === undefined) return;
  ghost.inert = true;
  document.body.append(ghost);
  if (ghost.hasAttribute("popover")) ghost.showPopover();
  const fade = ghost.animate([{ opacity: 1 }, { opacity: 0, translate: "0 -4px" }], {
    duration: 140,
    easing: "cubic-bezier(0.5, 0, 0.9, 0.4)",
    fill: "forwards",
  });
  fade.onfinish = () => {
    ghost.remove();
  };
}

function usePillLayer(ref: RefObject<HTMLElement | null>, banner: boolean) {
  useLayoutEffect(() => {
    if (!banner) ref.current?.showPopover();
  }, [ref, banner]);
  useLayoutEffect(() => {
    const pill = ref.current;
    return () => {
      if (pill !== null) leaveByCopy(pill);
    };
  }, [ref]);
}

// The flash itself, on the page while it has something to say: closed, it leaves with its holds, which
// no pointerleave or blur would end.
function Pill({ message, onClose, banner }: { message: FlashMessage; onClose: () => void; banner: boolean }) {
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
  const timed = (action === undefined || banner) && !pointed;
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
  // region stays in the page, where it is announced. A banner, raised by the page and never from a
  // dialog, stays in the page: an open dialog's layer covers it (8j).
  usePillLayer(pillRef, banner);
  return (
    <div
      ref={pillRef}
      popover={banner ? undefined : "manual"}
      data-stays={action === undefined || banner ? undefined : ""}
      data-banner={banner ? "" : undefined}
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
          {/* A banner's line is in the one label style, as frames 18, 23 and 93 draw it ("TODAY'S EXPEDITION · 1 OF 3"). */}
          {line === undefined ? null : <p className={banner ? "label" : "meta"}>{line}</p>}
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
export function Flash({ message, onClose, banner = false }: FlashProps) {
  return (
    <div role="status">{message === null ? null : <Pill message={message} onClose={onClose} banner={banner} />}</div>
  );
}

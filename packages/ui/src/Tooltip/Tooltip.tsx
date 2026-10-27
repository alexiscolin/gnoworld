import { useEffect, useLayoutEffect, useRef, useState, type ReactNode, type RefObject } from "react";
import { floating, usePlaced } from "../Popover/floating.ts";
import styles from "./Tooltip.module.css";

export interface TooltipProps {
  /** The words, the same as the control's name: assistive technology reads that name, not these. */
  label: string;
  children: ReactNode;
}

// docs/DESIGN-SYSTEM.md, "Tooltip": a moment under the pointer before it shows, none for the keyboard.
const DELAY = 500;

// The frames a refused show waits at most: Chrome's refusal lasts one popover's toggle; one that lasts longer leaves
// the words hidden until the next change (/code-review on F832).
const FRAMES_WAITED = 3;

// The words shown or hidden; false when Chrome refuses it during another popover's toggle.
function toggled(words: HTMLElement, shown: boolean): boolean {
  try {
    words.togglePopover(shown);
    return true;
  } catch (error) {
    if (error instanceof DOMException && error.name === "InvalidStateError") return false;
    throw error;
  }
}

// Shown before it is placed: a box out of the top layer has no size to place by. Chrome refuses a show inside another
// popover's show or hide (a menu closed by Esc hands the focus back to its trigger, this control, in its hide): the
// words wait for the next frame. The frames waited, which place them again (F832).
function useToggled(tipRef: RefObject<HTMLSpanElement | null>, shown: boolean): number {
  const [frames, setFrames] = useState(0);
  // The frames waited since the last toggle that went: each refusal its own few, never one every frame for good.
  const waitedRef = useRef(0);
  useLayoutEffect(() => {
    const words = tipRef.current;
    if (words === null) return;
    if (toggled(words, shown)) {
      waitedRef.current = 0;
      return;
    }
    if (waitedRef.current >= FRAMES_WAITED) return;
    waitedRef.current += 1;
    const later = requestAnimationFrame(() => {
      setFrames((count) => count + 1);
    });
    return () => {
      cancelAnimationFrame(later);
    };
  }, [tipRef, shown, frames]);
  return frames;
}

/** An icon-only control's name above it: under the pointer after a moment, at once with the keyboard's
 * focus; it stays while the pointer is on it, and Esc hides it (WCAG 1.4.13). */
export function Tooltip({ label, children }: TooltipProps) {
  // The pointer's hold and the keyboard focus's, each its own (F334), and Esc, which hides the words
  // until the pointer or the focus comes again.
  const [pointer, setPointer] = useState<"away" | "waiting" | "over">("away");
  const [focused, setFocused] = useState(false);
  const [dismissed, setDismissed] = useState(false);
  const anchorRef = useRef<HTMLSpanElement>(null);
  const tipRef = useRef<HTMLSpanElement>(null);
  const shown = !dismissed && (pointer === "over" || focused);
  const near = pointer !== "away" || focused;
  useEffect(() => {
    if (pointer !== "waiting") return;
    const timer = setTimeout(() => {
      setPointer("over");
    }, DELAY);
    return () => {
      clearTimeout(timer);
    };
  }, [pointer]);
  // Esc wherever the focus is: the pointer may rest on the control while the keyboard works elsewhere.
  useEffect(() => {
    if (!near) return;
    const stop = new AbortController();
    // A shown tooltip takes the first Esc, before the dialog or popover around its control (WCAG 1.4.13).
    document.addEventListener(
      "keydown",
      (event) => {
        if (event.key !== "Escape") return;
        if (shown) {
          event.preventDefault();
          event.stopPropagation();
        }
        setDismissed(true);
      },
      { capture: true, signal: stop.signal },
    );
    return () => {
      stop.abort();
    };
  }, [near, shown]);
  // A focused control removed may fire no blur (jsdom fires none): while the focus holds the words, a
  // change inside reads where the focus is now (F353, F316's class).
  useEffect(() => {
    const anchor = anchorRef.current;
    if (!focused || anchor === null) return;
    const watch = new MutationObserver(() => {
      if (!anchor.contains(document.activeElement)) setFocused(false);
    });
    watch.observe(anchor, { childList: true, subtree: true });
    return () => {
      watch.disconnect();
    };
  }, [focused]);
  const frames = useToggled(tipRef, shown);
  usePlaced(anchorRef, tipRef, { open: shown, side: "above", align: "center", again: frames });
  return (
    <span
      ref={anchorRef}
      className={styles["anchor"]}
      onPointerEnter={() => {
        setPointer((now) => (now === "away" ? "waiting" : now));
        setDismissed(false);
      }}
      onPointerLeave={() => {
        setPointer("away");
      }}
      onFocus={(event) => {
        if (!(event.target instanceof Element && event.target.matches(":focus-visible"))) return;
        setFocused(true);
        setDismissed(false);
      }}
      onBlur={(event) => {
        if (!(event.relatedTarget instanceof Node && event.currentTarget.contains(event.relatedTarget)))
          setFocused(false);
      }}
    >
      {children}
      <span ref={tipRef} popover="manual" className={floating(styles["tip"])} aria-hidden="true" data-shown={shown}>
        {label}
      </span>
    </span>
  );
}

import { useEffect, useLayoutEffect, useRef, useState, type ReactNode } from "react";
import { floating, usePlaced } from "../Popover/floating.ts";
import styles from "./Tooltip.module.css";

export interface TooltipProps {
  /** The words, the same as the control's name: assistive technology reads that name, not these. */
  label: string;
  children: ReactNode;
}

// docs/DESIGN-SYSTEM.md, "Tooltip": a moment under the pointer before it shows, none for the keyboard.
const DELAY = 500;

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
  // Shown before it is placed: a box out of the top layer has no size to place by.
  useLayoutEffect(() => {
    tipRef.current?.togglePopover(shown);
  }, [shown]);
  usePlaced(anchorRef, tipRef, { open: shown, side: "above", align: "center" });
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

import { useEffect, useLayoutEffect, useRef, useState, type ReactNode } from "react";
import { usePlaced } from "../Popover/floating.ts";
import { floating } from "../Popover/Popover.tsx";
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
  const [state, setState] = useState<"idle" | "waiting" | "shown">("idle");
  const anchorRef = useRef<HTMLSpanElement>(null);
  const tipRef = useRef<HTMLSpanElement>(null);
  const shown = state === "shown";
  useEffect(() => {
    if (state !== "waiting") return;
    const timer = setTimeout(() => {
      setState("shown");
    }, DELAY);
    return () => {
      clearTimeout(timer);
    };
  }, [state]);
  // Esc wherever the focus is: the pointer may rest on the control while the keyboard works elsewhere.
  useEffect(() => {
    if (state === "idle") return;
    const stop = new AbortController();
    document.addEventListener(
      "keydown",
      (event) => {
        if (event.key === "Escape") setState("idle");
      },
      { signal: stop.signal },
    );
    return () => {
      stop.abort();
    };
  }, [state]);
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
        setState((now) => (now === "idle" ? "waiting" : now));
      }}
      onPointerLeave={() => {
        setState("idle");
      }}
      onFocus={(event) => {
        if (event.target instanceof Element && event.target.matches(":focus-visible")) setState("shown");
      }}
      onBlur={(event) => {
        if (!(event.relatedTarget instanceof Node && event.currentTarget.contains(event.relatedTarget)))
          setState("idle");
      }}
    >
      {children}
      <span ref={tipRef} popover="manual" className={floating(styles["tip"])} aria-hidden="true" data-shown={shown}>
        {label}
      </span>
    </span>
  );
}

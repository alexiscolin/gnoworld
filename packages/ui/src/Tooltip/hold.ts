import { useEffect } from "react";

// What a tooltip's words and a chart's hold in common (F2862): the keyboard's focus alone holds them, and Esc takes them down first.

/** True when the focus came by the keyboard: a mouse click or a tap on a control also focuses it, and must not hold words
 * that the pointer's leaving would take away (WCAG 1.4.13; Tooltip's own guard, now shared). */
export function keyboardFocus(event: { target: EventTarget }): boolean {
  return event.target instanceof Element && event.target.matches(":focus-visible");
}

/** While `listening`, Esc anywhere takes `onEscape`. When `swallow` (words are shown), that first Esc goes no further, so a
 * dialog or popover around the control is not asked to close with it (WCAG 1.4.13). */
export function useFirstEscape(listening: boolean, swallow: boolean, onEscape: () => void): void {
  useEffect(() => {
    if (!listening) return;
    const stop = new AbortController();
    document.addEventListener(
      "keydown",
      (event) => {
        if (event.key !== "Escape") return;
        if (swallow) {
          event.preventDefault();
          event.stopPropagation();
        }
        onEscape();
      },
      { capture: true, signal: stop.signal },
    );
    return () => {
      stop.abort();
    };
  }, [listening, swallow, onEscape]);
}

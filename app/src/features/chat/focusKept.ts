// The focus held in a part of a line that a verdict can take away (4g's player, F896; 8f's page preview): when a hide or an edit takes
// the part away, the focus goes back to its line, which the list's keys reach (4c: the list is no tab stop itself), not to the page.
import { useLayoutEffect, useRef, type FocusEvent } from "react";

/** The handlers to spread on the part's box; `hidden` says the verdict took the part away. */
export function useFocusKept(hidden: boolean) {
  const heldRef = useRef(false);
  const lineRef = useRef<HTMLElement | null>(null);
  useLayoutEffect(() => {
    if (!hidden || !heldRef.current) return;
    heldRef.current = false;
    if (document.activeElement === document.body) lineRef.current?.focus();
  }, [hidden]);
  return {
    onFocus: (event: FocusEvent<HTMLDivElement>) => {
      heldRef.current = true;
      lineRef.current = event.currentTarget.closest("li");
    },
    onBlur: (event: FocusEvent<HTMLDivElement>) => {
      const to = event.relatedTarget;
      if (to !== null && !event.currentTarget.contains(to)) heldRef.current = false;
    },
  };
}

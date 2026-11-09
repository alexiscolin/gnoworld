import { useLayoutEffect, useRef, type RefObject } from "react";

// A menu asked at a point: shown, then, once placed by its trigger, moved to the point and kept inside the screen. Each `at` is
// handled once, so closing the menu does not open it again.
export function useAtPoint(
  panelRef: RefObject<HTMLDivElement | null>,
  open: boolean,
  at: { x: number; y: number } | undefined,
) {
  const handledRef = useRef<object>(undefined);
  useLayoutEffect(() => {
    const panel = panelRef.current;
    if (at === undefined || panel === null) return;
    if (!open) {
      if (handledRef.current !== at) {
        handledRef.current = at;
        panel.showPopover();
      }
      return;
    }
    const { width, height } = panel.getBoundingClientRect();
    const { clientWidth, clientHeight } = document.documentElement;
    const step = Number.parseFloat(getComputedStyle(panel).getPropertyValue("--space-2xs")) || 0;
    panel.style.left = `${String(Math.max(step, Math.min(at.x, clientWidth - step - width)))}px`;
    panel.style.top = `${String(Math.max(step, Math.min(at.y, clientHeight - step - height)))}px`;
  }, [at, open, panelRef]);
}

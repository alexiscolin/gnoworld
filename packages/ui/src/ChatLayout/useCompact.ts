import { useLayoutEffect, useRef, useState } from "react";

/** Whether the box is `limit` px wide or less, read as laid out (a move's transform aside), again as it resizes and as `moved` changes: the chat's
 * regions follow the width it is given (a dock beside a scene, the window), not the window's. A box not measured yet is compact, so no panel is drawn before its width is known; one not drawn keeps its last word. */
export function useCompact(box: HTMLElement | null, limit: number, moved?: unknown): boolean {
  const [compact, setCompact] = useState(true);
  const boxRef = useRef<HTMLElement | null>(null);
  useLayoutEffect(() => {
    boxRef.current = box;
    if (box === null) return;
    const read = () => {
      const width = boxRef.current?.offsetWidth ?? 0;
      if (width > 0) setCompact(width <= limit);
    };
    read();
    const watch = new ResizeObserver(read);
    watch.observe(box);
    return () => {
      watch.disconnect();
    };
    // `moved`: the box was taken to another place (the dock to the full chat), which its width is read again for at once.
  }, [box, limit, moved]);
  return compact;
}

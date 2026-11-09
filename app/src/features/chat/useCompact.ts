import { useLayoutEffect, useState, type RefObject } from "react";

/** Whether the box is `limit` px wide or less, read as laid out (a move's transform aside) and again as it resizes: the chat's
 * regions follow the width it is given (a dock beside a scene, the window), not the window's. A box not drawn keeps its last word. */
export function useCompact(ref: RefObject<HTMLElement | null>, limit: number): boolean {
  const [compact, setCompact] = useState(false);
  useLayoutEffect(() => {
    const box = ref.current;
    if (box === null) return;
    const read = () => {
      const width = box.offsetWidth;
      if (width > 0) setCompact(width <= limit);
    };
    read();
    const watch = new ResizeObserver(read);
    watch.observe(box);
    return () => {
      watch.disconnect();
    };
  }, [ref, limit]);
  return compact;
}

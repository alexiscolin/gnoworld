import { pauseOffscreen } from "../offscreen.ts";
import { useEffect, useRef, useState } from "react";

/** The width a graph has before it is measured (the proposal's 360). */
const WIDTH = 360;

// The graph draws at its own width (its dots then keep their size, as the proposal's) and its curves once it is in view (an arrival of its
// own: each curve after the one before).
export function useSeen() {
  const ref = useRef<SVGSVGElement>(null);
  const [seen, setSeen] = useState(false);
  const [span, setSpan] = useState(WIDTH);
  useEffect(() => {
    const node = ref.current;
    if (node === null) return undefined;
    const measure = () => {
      if (node.clientWidth > 0) setSpan(node.clientWidth);
    };
    measure();
    const unpause = pauseOffscreen(node);
    const resize = typeof ResizeObserver === "undefined" ? undefined : new ResizeObserver(measure);
    resize?.observe(node);
    return () => {
      resize?.disconnect();
      unpause();
    };
  }, []);
  useEffect(() => {
    const node = ref.current;
    if (node === null || typeof IntersectionObserver === "undefined") {
      setSeen(true);
      return undefined;
    }
    const watch = new IntersectionObserver((entries) => {
      if (entries.some((entry) => entry.isIntersecting)) {
        setSeen(true);
        watch.disconnect();
      }
    });
    watch.observe(node);
    return () => {
      watch.disconnect();
    };
  }, []);
  return { ref, seen, span };
}

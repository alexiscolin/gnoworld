// The views' pill's fill, one for the three views (D369): it stands under the current view's link, and slides and resizes to the next
// one as the page changes, its words' width each time; read off the links as they stand, a frame after the page changes and again when
// any part of the bar changes its width (a room changed in the full chat moves the links, D503). Placed at once the first time.
import { useLayoutEffect, useState, type CSSProperties, type RefObject } from "react";
import { useLocation } from "react-router";

interface Fill {
  readonly x: number;
  readonly width: number;
}

/** The fill's place, and whether it stood before (it then slides). */
export function useViewsIndicator(bar: RefObject<HTMLElement | null>, current: string | undefined, drawn: boolean) {
  const [fill, setFill] = useState<Fill | undefined>();
  const [placed, setPlaced] = useState(false);
  const { key } = useLocation();
  useLayoutEffect(() => {
    const nav = bar.current;
    if (nav?.querySelector("a[aria-current='page']") == null) return undefined;
    // The current link read at each call: another page can mark another one with the view unchanged.
    const place = () => {
      const link = nav.querySelector<HTMLElement>("a[aria-current='page']");
      if (link === null) return;
      const [from, to] = [nav.getBoundingClientRect(), link.getBoundingClientRect()];
      setFill({ x: to.left - from.left, width: to.width });
    };
    const frame = requestAnimationFrame(() => {
      place();
      requestAnimationFrame(() => {
        setPlaced(true);
      });
    });
    const sized = new ResizeObserver(place);
    for (const part of [nav, ...nav.querySelectorAll(":scope > *, a")]) sized.observe(part);
    return () => {
      cancelAnimationFrame(frame);
      sized.disconnect();
    };
  }, [bar, current, drawn, key]);
  return current === undefined ? { fill: undefined, placed } : { fill, placed };
}

/** The pill's attributes for its fill: its place, whether it stands, whether it slides. */
export const fillProps = (fill: Fill | undefined, placed: boolean) => ({
  style:
    fill === undefined
      ? undefined
      : ({ "--_fill-x": `${String(fill.x)}px`, "--_fill-w": `${String(fill.width)}px` } as CSSProperties),
  "data-filled": fill === undefined ? undefined : "",
  "data-placed": fill !== undefined && placed ? "" : undefined,
});

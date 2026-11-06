// Where the signs stand: the page's elements told by the ground on each frame the Earth moves. No React but for the counts' place, and nothing is
// read of the page on a frame: a bubble's height and the edge it keeps are read as the list changes.
import { useEffect, type RefObject } from "react";
import type { GroundMark } from "../../scene/earth/marks.ts";

/** The sheet's own width, frame 47's. */
const BUBBLE_WIDTH = 258;
const BUBBLE_GAP = 6;
// The bubble's place over its point, as frame 47's.
const BUBBLE_RISE = 62;
const EDGE = 8;
/** How far the golden ring reaches, in the globe's radii (frame 39). */
const RING = 1.106;
/** A little left of the ring's middle, as the frames have the counts. */
const COUNTS_LEFT = 48;
/** How much of the globe's room must be on screen for its signs to mean anything. */
const IN_SIGHT = 0.6;

// The right edge a bubble keeps: the ring's, where the dock begins, or the window's.
function reachOf() {
  const globe = document.querySelector<HTMLElement>("[data-globe]");
  const { left = 0, width = 0 } = globe?.getBoundingClientRect() ?? {};
  return width > 0 ? left + (width * (1 + RING)) / 2 : innerWidth;
}

const moved = (element: HTMLElement, x: number, y: number) => {
  element.style.transform = `translate(${String(Math.round(x))}px, ${String(Math.round(y))}px)`;
};

/** Where a bubble stands on the screen, kept for those after it, and the offset last written. */
interface Box {
  left: number;
  top: number;
  readonly height: number;
  x: number;
  y: number;
}

const covers = (other: Box, { left, height }: Box, top: number) =>
  Math.abs(other.left - left) < BUBBLE_WIDTH + BUBBLE_GAP &&
  top < other.top + other.height + BUBBLE_GAP &&
  top + height + BUBBLE_GAP > other.top;

// Above every bubble before it: the frames let neighbours cover each other's words, which a reader then cannot read. Each pass only rises, so
// it ends.
function clearOf(boxes: readonly Box[], own: Box): number {
  let top = own.top;
  for (let rising = true; rising;) {
    rising = false;
    for (const other of boxes) {
      if (other === own) break;
      if (covers(other, own, top)) {
        top = other.top - own.height - BUBBLE_GAP;
        rising = true;
      }
    }
  }
  return top;
}

// A focused pin stays until the focus leaves it: hidden, it would drop the reader's place in the page.
const spotMark = (element: HTMLElement, lat: number, lon: number): GroundMark => ({
  lat,
  lon,
  place: (x, y, front) => {
    element.hidden = !front && !element.contains(document.activeElement);
    moved(element, x, y);
  },
});

// The element stands on the point; the bubble is offset from it by the sheet, which eases a move clear of another or a change of side.
function bubbleMark(element: HTMLElement, boxes: Box[], reach: number): GroundMark {
  const own: Box = { left: 0, top: 0, height: element.offsetHeight, x: Number.NaN, y: Number.NaN };
  const { style } = element;
  boxes.push(own);
  return {
    lat: Number(element.dataset["lat"]),
    lon: Number(element.dataset["lon"]),
    place: (x, y) => {
      const leftwards = x + BUBBLE_GAP + BUBBLE_WIDTH > reach;
      own.left = Math.max(EDGE, leftwards ? x - BUBBLE_GAP - BUBBLE_WIDTH : x + BUBBLE_GAP);
      own.top = y - BUBBLE_RISE;
      own.top = clearOf(boxes, own);
      moved(element, x, y);
      const [offsetX, offsetY] = [Math.round(own.left - x), Math.round(own.top - y)];
      if (offsetX !== own.x) style.setProperty("--_x", `${String(offsetX)}px`);
      if (offsetY !== own.y) {
        style.setProperty("--_y", `${String(offsetY)}px`);
        style.setProperty("--_lift", `${String(-offsetY - BUBBLE_RISE)}px`);
      }
      own.x = offsetX;
      own.y = offsetY;
      style.visibility = "visible";
    },
  };
}

/** The marks of the signs drawn now, in their order: a later bubble moves clear of the earlier ones. */
export function marksOf(elements: Iterable<HTMLElement>): GroundMark[] {
  const boxes: Box[] = [];
  const reach = reachOf();
  return Array.from(elements, (element) =>
    element.dataset["mark"] === "bubble"
      ? bubbleMark(element, boxes, reach)
      : spotMark(element, Number(element.dataset["lat"]), Number(element.dataset["lon"])),
  );
}

// Where the page keeps the globe: the counts stand under its ring, and the signs, which stand fixed, leave once it has scrolled away.
export function useUnderRing(box: RefObject<HTMLElement | null>) {
  useEffect(() => {
    const globe = document.querySelector<HTMLElement>("[data-globe]");
    if (globe === null || box.current === null) return;
    const root = box.current;
    const stop = new AbortController();
    const place = () => {
      const { left, top, width } = globe.getBoundingClientRect();
      const [counts, reach] = [left + width / 2 - COUNTS_LEFT, left + (width * (1 + RING)) / 2];
      root.style.setProperty("--_foot", `${String(Math.round(top + scrollY + (width * (1 + RING)) / 2))}px`);
      root.style.setProperty("--_left", `${String(Math.round(counts))}px`);
      root.style.setProperty("--_room", `${String(Math.round(reach - counts))}px`);
    };
    const sized = new ResizeObserver(place);
    sized.observe(globe);
    const seen = new IntersectionObserver(
      ([entry]) => {
        root.hidden = (entry?.intersectionRatio ?? 1) < IN_SIGHT;
      },
      { threshold: IN_SIGHT },
    );
    seen.observe(globe);
    window.addEventListener("resize", place, { signal: stop.signal });
    place();
    return () => {
      sized.disconnect();
      seen.disconnect();
      stop.abort();
    };
  }, [box]);
}

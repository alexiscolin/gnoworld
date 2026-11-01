// Where the signs stand: the page's elements told by the ground on each frame the Earth moves. No React but for the counts' place, and nothing is
// read of the page on a frame: a bubble's height and the edge it keeps are read as the list changes.
import { useEffect, type RefObject } from "react";
import type { GroundMark } from "../../scene/earth/marks.ts";

const BUBBLE_WIDTH = 256;
const BUBBLE_GAP = 6;
// The bubble's place over its point, as frame 47's.
const BUBBLE_RISE = 62;
const EDGE = 8;
/** How far the golden ring reaches, in the globe's radii (frame 39). */
const RING = 1.106;
/** A little left of the ring's middle, as the frames have the counts. */
const COUNTS_LEFT = 48;

// The right edge a bubble keeps: the ring's, where the dock begins, or the window's.
function reachOf() {
  const globe = document.querySelector<HTMLElement>("[data-globe]");
  const { left = 0, width = 0 } = globe?.getBoundingClientRect() ?? {};
  return width > 0 ? left + (width * (1 + RING)) / 2 : innerWidth;
}

const moved = (element: HTMLElement, x: number, y: number) => {
  element.style.transform = `translate(${String(Math.round(x))}px, ${String(Math.round(y))}px)`;
};

/** Where a bubble stands on the screen, kept for those after it. */
interface Box {
  left: number;
  top: number;
  readonly height: number;
}

// Above the first bubble it would cover: the frames let neighbours cover each other's words, which a reader then cannot read.
function clearOf(boxes: readonly Box[], own: Box): number {
  let top = own.top;
  for (const other of boxes) {
    if (other === own) return top;
    const apart = Math.abs(other.left - own.left) >= BUBBLE_WIDTH + BUBBLE_GAP;
    if (!apart && top < other.top + other.height + BUBBLE_GAP && top + own.height + BUBBLE_GAP > other.top)
      top = other.top - own.height - BUBBLE_GAP;
  }
  return top;
}

const spotMark = (element: HTMLElement, lat: number, lon: number): GroundMark => ({
  lat,
  lon,
  place: (x, y, front) => {
    element.hidden = !front;
    moved(element, x, y);
  },
});

function bubbleMark(element: HTMLElement, boxes: Box[], reach: number): GroundMark {
  const own: Box = { left: 0, top: 0, height: element.offsetHeight };
  boxes.push(own);
  return {
    lat: Number(element.dataset["lat"]),
    lon: Number(element.dataset["lon"]),
    place: (x, y) => {
      const left = x + BUBBLE_GAP + BUBBLE_WIDTH > reach;
      own.left = Math.max(EDGE, left ? x - BUBBLE_GAP - BUBBLE_WIDTH : x + BUBBLE_GAP);
      own.top = y - BUBBLE_RISE;
      const top = clearOf(boxes, own);
      element.style.setProperty("--_lift", `${String(Math.round(own.top - top))}px`);
      own.top = top;
      moved(element, own.left, top);
      element.style.setProperty(
        "--_point",
        left ? `${String(BUBBLE_GAP + BUBBLE_WIDTH)}px` : `-${String(BUBBLE_GAP)}px`,
      );
      element.style.visibility = "visible";
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

// Where the page keeps the globe: the counts stand under its ring.
export function useUnderRing(box: RefObject<HTMLElement | null>) {
  useEffect(() => {
    const globe = document.querySelector<HTMLElement>("[data-globe]");
    if (globe === null || box.current === null) return;
    const root = box.current;
    const place = () => {
      const { left, top, width } = globe.getBoundingClientRect();
      const foot = top + scrollY + (width * (1 + RING)) / 2;
      root.style.setProperty("--_foot", `${String(Math.round(foot))}px`);
      root.style.setProperty("--_left", `${String(Math.round(left + width / 2 - COUNTS_LEFT))}px`);
    };
    const observer = new ResizeObserver(place);
    observer.observe(globe);
    place();
    return () => {
      observer.disconnect();
    };
  }, [box]);
}

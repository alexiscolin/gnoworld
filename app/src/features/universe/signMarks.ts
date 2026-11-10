// Where the signs stand: the page's elements told by the ground on each frame the Earth moves. No React but for the counts' place, and nothing is
// read of the page on a frame: a bubble's height and the edge it keeps are read as the list changes.
import { useEffect, type RefObject } from "react";
import type { GroundMark } from "../../space/earth/ground.ts";

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
// The edge a page's bubble must stand left of to be read: the dock's, else the window's.
const keepOf = () => document.querySelector("[data-dock]")?.getBoundingClientRect().left ?? innerWidth;

function reachOf() {
  const globe = document.querySelector<HTMLElement>("[data-globe]");
  const { left = 0, width = 0 } = globe?.getBoundingClientRect() ?? {};
  return width > 0 ? left + (width * (1 + RING)) / 2 : innerWidth;
}

// A sign or the signs' box fades out (the page's label fade, EarthSigns.module.css) and in again: `data-away`, never `hidden`, which would cut it.
const away = (element: HTMLElement, gone: boolean) => element.toggleAttribute("data-away", gone);

const moved = (element: HTMLElement, x: number, y: number) => {
  element.style.transform = `translate(${String(Math.round(x))}px, ${String(Math.round(y))}px)`;
};

/** Where a bubble stands on the screen, kept for those after it, and the offset last written. */
interface Box {
  left: number;
  top: number;
  readonly width: number;
  readonly height: number;
  x: number;
  y: number;
}

const covers = (other: Box, { left, width, height }: Box, top: number) =>
  Math.abs(other.left - left) < Math.max(other.width, width) + BUBBLE_GAP &&
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
    away(element, !front && !element.contains(document.activeElement));
    moved(element, x, y);
  },
});

// Whether a point stands right of and under `from`, and left of `keep`.
const stands = (at: { x: number; y: number }, from: { x: number; y: number }, keep = Infinity) =>
  at.x >= from.x && at.y >= from.y && at.x < keep;

// The element stands on the point; the bubble is offset from it by the sheet, which eases a move clear of another or a change of side.
function bubbleMark(element: HTMLElement, boxes: Box[], { reach, scale, floor, keep, from }: Fit): GroundMark {
  const [width, rise] = [BUBBLE_WIDTH * scale, BUBBLE_RISE * scale];
  const own: Box = { left: 0, top: 0, width, height: element.offsetHeight * scale, x: Number.NaN, y: Number.NaN };
  const { style } = element;
  boxes.push(own);
  return {
    lat: Number(element.dataset["lat"]),
    lon: Number(element.dataset["lon"]),
    keep,
    from,
    place: (x, y, front) => {
      const leftwards = x + BUBBLE_GAP + width > reach;
      own.left = Math.max(from?.x ?? EDGE, leftwards ? x - BUBBLE_GAP - width : x + BUBBLE_GAP);
      own.top = y - rise;
      own.top = Math.max(floor, clearOf(boxes, own));
      moved(element, x, y);
      const [offsetX, offsetY] = [Math.round(own.left - x), Math.round(own.top - y)];
      if (offsetX !== own.x) style.setProperty("--_x", `${String(offsetX)}px`);
      if (offsetY !== own.y) {
        style.setProperty("--_y", `${String(offsetY)}px`);
        style.setProperty("--_lift", `${String(-offsetY - rise)}px`);
      }
      own.x = offsetX;
      own.y = offsetY;
      // A world's bubble shows only while its point stands in the free area, the view's side: it comes in as the world turns it there.
      const gone = from !== undefined && !(front && stands({ x, y }, from, keep));
      away(element, gone);
      style.visibility = gone ? "hidden" : "visible";
    },
  };
}

/** Where the bubbles stand: the right edge they keep, and the share of their size they are drawn at (a small view's, EarthSigns.tsx). */
export interface Fit {
  readonly reach: number;
  readonly scale: number;
  /** The highest a bubble stands: none in the page, the small view's top edge. */
  readonly floor: number;
  /** The page's x a bubble must stand left of to be read, which turns the Earth (D488); none in a small view. */
  readonly keep?: number | undefined;
  /** A world's: the plate's right edge and the header's foot, which its bubbles keep clear of (D565); none on the Earth, whose do not. */
  readonly from?: { readonly x: number; readonly y: number } | undefined;
}

// A plate that stands beside the dock leaves the room between them; one stacked over the planet, as on a narrow page, leaves none to keep.
const LEAST_ROOM = 240;

/** The free area of a world's page: right of the plate, under the header, left of the dock. */
export function worldFit(): Fit {
  const keep = keepOf();
  const plate = document.querySelector("[data-look='plate']")?.getBoundingClientRect();
  const aside = plate !== undefined && keep - plate.right >= LEAST_ROOM;
  const header = document.querySelector("header")?.getBoundingClientRect().bottom ?? 0;
  const from = { x: aside ? plate.right + EDGE : EDGE, y: header };
  return { reach: Math.min(reachOf(), keep), scale: 1, floor: header, keep, from };
}

/** The marks of the signs drawn now, in their order: a later bubble moves clear of the earlier ones. */
export function marksOf(
  elements: Iterable<HTMLElement>,
  fit: Fit = { reach: reachOf(), scale: 1, floor: -Infinity, keep: keepOf() },
): GroundMark[] {
  const boxes: Box[] = [];
  return Array.from(elements, (element) =>
    element.dataset["mark"] === "bubble"
      ? bubbleMark(element, boxes, fit)
      : spotMark(element, Number(element.dataset["lat"]), Number(element.dataset["lon"])),
  );
}

// Where the page keeps the globe: the counts stand under its ring, and the signs, which stand fixed, leave once it has scrolled away; a small
// view's stand in its box and need none of it.
export function useUnderRing(box: RefObject<HTMLElement | null>, inside: boolean) {
  useEffect(() => {
    if (inside) return;
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
        away(root, (entry?.intersectionRatio ?? 1) < IN_SIGHT);
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
  }, [box, inside]);
}

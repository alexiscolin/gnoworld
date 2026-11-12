// The reader's hand on space (D401, the demo's): a drag turns the view round what it looks at, with inertia; a wheel brings it nearer what
// the pointer is over far out (a system, its middle), and in a system a wheel in over a planet dives there in one move; a click enters what
// it aims at; a wheel out on a page, or Escape, goes up a level. A trackpad's momentum after a dive is spent, never a second dive.
import { holdsEscape } from "@gnoworld/ui";
import type { PerspectiveCamera } from "three";
import type { Hit } from "./pick.ts";
import type { Rig } from "./rig/rig.ts";

/** What a drag turns instead of the camera (D13011): a generated world on its page. */
export interface Turner {
  /** The pointer moved by `dx`, `dy` pixels, `seconds` after its last move. */
  readonly drag: (move: { dx: number; dy: number; seconds: number }) => void;
  readonly release: (stood: boolean) => void;
}

export interface Hand {
  readonly canvas: HTMLCanvasElement;
  /** The names' layer over the canvas: a wheel over a name is space's too. */
  readonly labels: HTMLElement;
  readonly rig: Rig;
  readonly camera: PerspectiveCamera;
  readonly screen: { readonly width: number; readonly height: number };
  /** What is under the screen's point, or the name `target` is. */
  readonly under: (x: number, y: number, target?: EventTarget | null) => Hit | undefined;
  /** Whether a wheel in over `hit` dives there: in a system, a planet the camera is not at. */
  readonly deeper: (hit: Hit) => boolean;
  /** What the mouse is over now, none when it leaves; no touch asks it. */
  readonly over?: (hit: Hit | undefined) => void;
  readonly enter: (hit: Hit) => void;
  /** What a drag that begins now turns; none, it moves the camera. */
  readonly turner: () => Turner | undefined;
  readonly up: () => void;
}

const DRAG_FROM = 4;
const STOOD_MS = 80;
const GESTURE_GAP_MS = 260;
const DIVE_IN = 24;
const GO_UP = 60;
const LINE_PIXELS = 16;
const PINCH = 10;

/** Listens till `signal` aborts. */
export function listen(hand: Hand, signal: AbortSignal): void {
  watchDrag(hand, signal);
  watchWheel(hand, signal);
  window.addEventListener(
    "keydown",
    (event) => {
      if (event.key === "Escape" && !event.defaultPrevented && !holdsEscape(event)) hand.up();
    },
    { signal },
  );
}

function watchDrag(hand: Hand, signal: AbortSignal): void {
  const { canvas, rig } = hand;
  let press:
    | {
        x: number;
        y: number;
        x0: number;
        y0: number;
        at: number;
        moved: boolean;
        id: number;
        turner: Turner | undefined;
      }
    | undefined;
  canvas.addEventListener(
    "pointerdown",
    (event) => {
      // A second finger never takes a turn over from the first.
      if (event.button !== 0 || press?.turner !== undefined) return;
      event.preventDefault();
      canvas.setPointerCapture(event.pointerId);
      press = {
        x: event.clientX,
        y: event.clientY,
        x0: event.clientX,
        y0: event.clientY,
        at: event.timeStamp,
        moved: false,
        id: event.pointerId,
        turner: hand.turner(),
      };
    },
    { signal },
  );
  canvas.addEventListener(
    "pointermove",
    ({ clientX, clientY, timeStamp, pointerId }) => {
      if (press === undefined || (press.turner !== undefined && pointerId !== press.id)) return;
      press.moved ||= Math.hypot(clientX - press.x0, clientY - press.y0) > DRAG_FROM;
      if (!press.moved || rig.flying) return;
      const move = { dx: clientX - press.x, dy: clientY - press.y, seconds: (timeStamp - press.at) / 1000 };
      if (press.turner !== undefined) press.turner.drag(move);
      else rig.free.drag({ ...move, height: innerHeight });
      [press.x, press.y, press.at] = [clientX, clientY, timeStamp];
    },
    { signal, passive: true },
  );
  canvas.addEventListener(
    "pointermove",
    (event) => {
      if (press === undefined && event.pointerType === "mouse") hand.over?.(hand.under(event.clientX, event.clientY));
    },
    { signal, passive: true },
  );
  canvas.addEventListener(
    "pointerleave",
    () => {
      hand.over?.(undefined);
    },
    { signal },
  );
  const letGo = (event: PointerEvent) => {
    const was = press;
    if (was === undefined || (was.turner !== undefined && event.pointerId !== was.id)) return;
    press = undefined;
    if (was.moved) (was.turner ?? rig.free).release(event.timeStamp - was.at > STOOD_MS);
    else if (event.type === "pointerup") {
      const hit = hand.under(event.clientX, event.clientY);
      if (hit !== undefined) hand.enter(hit);
    }
  };
  canvas.addEventListener("pointerup", letGo, { signal });
  canvas.addEventListener("pointercancel", letGo, { signal });
}

interface Gesture {
  into: number;
  out: number;
  at: number;
  spent: boolean;
}

// The wheel's pixels of `event`, a line's and a pinch's made pixels.
const pixelsOf = (event: WheelEvent): number =>
  event.deltaY * (event.deltaMode === 1 ? LINE_PIXELS : 1) * (event.ctrlKey ? PINCH : 1);

// Adds `event` to `gesture`, a new one after a pause: what a flight started is spent, the next gesture counts.
function count(gesture: Gesture, event: WheelEvent, { flying, pixels }: { flying: boolean; pixels: number }): void {
  if (event.timeStamp - gesture.at > GESTURE_GAP_MS) Object.assign(gesture, { into: 0, out: 0, spent: flying });
  gesture.at = event.timeStamp;
  if (pixels < 0) gesture.into -= pixels;
  else gesture.out += pixels;
}

// A wheel in over what is deeper dives there; true where it did.
function dove(hand: Hand, gesture: Gesture, event: WheelEvent): boolean {
  if (gesture.into <= DIVE_IN) return false;
  const hit = hand.under(event.clientX, event.clientY, event.target);
  if (hit === undefined || !hand.deeper(hit)) return false;
  Object.assign(gesture, { into: 0, spent: true });
  hand.enter(hit);
  return true;
}

// A wheel out goes up a level; true where it did.
function wentUp(hand: Hand, gesture: Gesture): boolean {
  if (gesture.out <= GO_UP) return false;
  Object.assign(gesture, { out: 0, spent: true });
  hand.up();
  return true;
}

function wheel(hand: Hand, gesture: Gesture, event: WheelEvent): void {
  const { rig } = hand;
  const pixels = pixelsOf(event);
  count(gesture, event, { flying: rig.flying, pixels });
  if (rig.flying) {
    if (gesture.out > GO_UP) Object.assign(gesture, { out: 0, spent: true });
    return;
  }
  if (gesture.spent || dove(hand, gesture, event)) return;
  if (rig.page) {
    wentUp(hand, gesture);
    return;
  }
  rig.anchorAt(event.clientX, event.clientY, hand);
  rig.free.wheel(pixels);
}

function watchWheel(hand: Hand, signal: AbortSignal): void {
  const gesture: Gesture = { into: 0, out: 0, at: -Infinity, spent: false };
  const turned = (event: WheelEvent) => {
    event.preventDefault();
    wheel(hand, gesture, event);
  };
  for (const over of [hand.canvas, hand.labels]) over.addEventListener("wheel", turned, { signal, passive: false });
}

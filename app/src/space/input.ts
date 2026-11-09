// The reader's hand on space (D401, the demo's): a drag turns the view round what it looks at, with inertia; a wheel brings it nearer what
// the pointer is over far out (a system, its middle), and in a system a wheel in over a planet dives there in one move; a click enters what
// it aims at; a wheel out on a page, or Escape, goes up a level. A trackpad's momentum after a dive is spent, never a second dive.
import type { PerspectiveCamera } from "three";
import type { Hit } from "./pick.ts";
import type { Rig } from "./rig/rig.ts";

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
  readonly enter: (hit: Hit) => void;
  readonly up: () => void;
}

const DRAG_FROM = 4;
const STOOD_MS = 80;
const GESTURE_GAP_MS = 260;
const DIVE_IN = 24;
const GO_UP = 60;
const LINE_PIXELS = 16;
const PINCH = 10;

// A key typed in a field, or with a dialog or a popover open (an open one alone: the page keeps closed ones), is theirs: Escape closes
// them, and never goes up a level of space behind them.
const typing = (event: KeyboardEvent) =>
  (event.target instanceof Element &&
    event.target.closest("input, textarea, select, [contenteditable='true']") !== null) ||
  document.querySelector("dialog[open], :popover-open") !== null;

/** Listens till `signal` aborts. */
export function listen(hand: Hand, signal: AbortSignal): void {
  watchDrag(hand, signal);
  watchWheel(hand, signal);
  window.addEventListener(
    "keydown",
    (event) => {
      if (event.key === "Escape" && !event.defaultPrevented && !typing(event)) hand.up();
    },
    { signal },
  );
}

function watchDrag(hand: Hand, signal: AbortSignal): void {
  const { canvas, rig } = hand;
  let press: { x: number; y: number; x0: number; y0: number; at: number; moved: boolean } | undefined;
  canvas.addEventListener(
    "pointerdown",
    (event) => {
      if (event.button !== 0) return;
      event.preventDefault();
      canvas.setPointerCapture(event.pointerId);
      press = {
        x: event.clientX,
        y: event.clientY,
        x0: event.clientX,
        y0: event.clientY,
        at: event.timeStamp,
        moved: false,
      };
    },
    { signal },
  );
  canvas.addEventListener(
    "pointermove",
    ({ clientX, clientY, timeStamp }) => {
      if (press === undefined) return;
      press.moved ||= Math.hypot(clientX - press.x0, clientY - press.y0) > DRAG_FROM;
      if (!press.moved || rig.flying) return;
      rig.free.drag({
        dx: clientX - press.x,
        dy: clientY - press.y,
        height: innerHeight,
        seconds: (timeStamp - press.at) / 1000,
      });
      [press.x, press.y, press.at] = [clientX, clientY, timeStamp];
    },
    { signal, passive: true },
  );
  const letGo = (event: PointerEvent) => {
    const was = press;
    press = undefined;
    if (was === undefined) return;
    if (was.moved) rig.free.release(event.timeStamp - was.at > STOOD_MS);
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

// Where a view's labels stand on a frame (ADR-0002 §1: labels never overlap; slice 7 §3: off the plate, the rail and each other): beside
// their bodies as frame 4's stand, a stem from the label to the body's outline, in the slots' order of priority, clear of each other, of the
// boxes the page keeps and of the bodies' discs. A label keeps its side while it fits, tries the others, and hides where none fits. Depth: a
// far world's label is smaller and fainter. Plain numbers in typed arrays the caller keeps, for a frame runs it.
import { clamp01 } from "../space/smooth.ts";
import { PLACE } from "./place.ts";

export { PLACE };

export const LABEL_SLOTS = 8;
export const BOXES_MOST = 8;
// Every body a look stands (lod/bounds.ts BOUNDS.bodies, 40), the Earth and room to spare.
export const DISCS_MOST = 48;
/** Depth: from `near` to `far` world units a label shrinks to `scale` and fades to `fade`. `near` is the farthest the rest's eye stands
 * from the Earth (frame/restLook.ts's DISTANCES, 24 to 28), so the Earth's label is whole; `scale` keeps 12 px figures at 11 px. */
export const DEPTH = { near: 28, far: 80, scale: 0.92, fade: 0.65 } as const;
const SIDES = 4;
const SPAN = Math.log(DEPTH.far / DEPTH.near);

export class LabelLayout {
  screenWidth = 0;
  screenHeight = 0;
  readonly active = new Uint8Array(LABEL_SLOTS);
  /** Each body's centre and radius on screen, in pixels, and its distance from the eye, in world units. */
  readonly x = new Float64Array(LABEL_SLOTS);
  readonly y = new Float64Array(LABEL_SLOTS);
  readonly radius = new Float64Array(LABEL_SLOTS);
  readonly away = new Float64Array(LABEL_SLOTS);
  /** Each label's size at a scale of 1. */
  readonly width = new Float64Array(LABEL_SLOTS);
  readonly height = new Float64Array(LABEL_SLOTS);
  /** The slots, first placed first. */
  readonly order = Uint8Array.from({ length: LABEL_SLOTS }, (_, slot) => slot);
  /** The disc of each slot's own body, which its label stands by, or -1. */
  readonly own = new Int8Array(LABEL_SLOTS).fill(-1);
  readonly left = new Float64Array(LABEL_SLOTS);
  readonly top = new Float64Array(LABEL_SLOTS);
  readonly scale = new Float64Array(LABEL_SLOTS);
  readonly fade = new Float64Array(LABEL_SLOTS);
  /** Where the stem stands, in from the label's left edge, at a scale of 1. */
  readonly stem = new Float64Array(LABEL_SLOTS);
  readonly shown = new Uint8Array(LABEL_SLOTS);
  /** Above at its start, above at its end, below at its start, below at its end; -1 before any. */
  readonly side = new Int8Array(LABEL_SLOTS).fill(-1);
  /** Left, top, right and bottom of each box kept clear. */
  readonly boxes = new Float64Array(4 * BOXES_MOST);
  boxCount = 0;
  /** Centre and radius of each disc kept clear. */
  readonly discs = new Float64Array(3 * DISCS_MOST);
  discCount = 0;
  /** The left edge of the band the page keeps for its rail, which a pill slides left of, its stem still over its body; none, no rail. */
  railLeft = Infinity;
}

// What a side would give, and the body it stands by, written here: a frame makes nothing.
const tried = { left: 0, top: 0, right: 0, bottom: 0, stem: 0 };
const body = { x: 0, y: 0, radius: 0, wide: 0, high: 0, scale: 1 };

function depth(layout: LabelLayout, slot: number): void {
  const reach = clamp01(Math.log((layout.away[slot] ?? 0) / DEPTH.near) / SPAN);
  const far = Number.isFinite(reach) ? reach : 1;
  layout.scale[slot] = 1 - (1 - DEPTH.scale) * far;
  layout.fade[slot] = 1 - (1 - DEPTH.fade) * far;
}

function read(layout: LabelLayout, slot: number): void {
  body.scale = layout.scale[slot] ?? 1;
  body.x = layout.x[slot] ?? NaN;
  body.y = layout.y[slot] ?? NaN;
  body.radius = layout.radius[slot] ?? NaN;
  body.wide = (layout.width[slot] ?? 0) * body.scale;
  body.high = (layout.height[slot] ?? 0) * body.scale;
}

// Where `side` stands the label of `body`, into `tried`, or false where its stem cannot reach the body: within the screen's margin and
// left of the rail's band, with the air a box keeps.
function standAt({ screenWidth, railLeft }: LabelLayout, side: number): boolean {
  const { x, y, radius, wide, high, scale } = body;
  const start = side % 2 === 0 ? x - PLACE.stem * scale : x - wide + PLACE.stem * scale;
  const right = Math.min(screenWidth - PLACE.margin, railLeft - PLACE.air);
  const left = Math.min(Math.max(start, PLACE.margin), right - wide);
  const stemAt = Math.min(Math.max(x, left + PLACE.stemLeast * scale), left + wide - PLACE.stemLeast * scale);
  if (!(Math.abs(stemAt - x) <= radius) || !(wide > 0)) return false;
  const outline = Math.sqrt(radius * radius - (stemAt - x) * (stemAt - x));
  tried.left = left;
  tried.top = side < 2 ? y - outline - PLACE.gap * scale - high : y + outline + PLACE.gap * scale;
  tried.right = left + wide;
  tried.bottom = tried.top + high;
  tried.stem = (stemAt - left) / scale;
  return true;
}

// Whether `tried` comes within the air of `against`.
const against = { left: 0, top: 0, right: 0, bottom: 0 };
const overBox = () =>
  tried.right + PLACE.air > against.left &&
  against.right + PLACE.air > tried.left &&
  tried.bottom + PLACE.air > against.top &&
  against.bottom + PLACE.air > tried.top;

function onBox(layout: LabelLayout, box: number): boolean {
  const at = 4 * box;
  against.left = layout.boxes[at] ?? 0;
  against.top = layout.boxes[at + 1] ?? 0;
  against.right = layout.boxes[at + 2] ?? 0;
  against.bottom = layout.boxes[at + 3] ?? 0;
  return overBox();
}

function onDisc(layout: LabelLayout, disc: number): boolean {
  const x = layout.discs[3 * disc] ?? 0;
  const y = layout.discs[3 * disc + 1] ?? 0;
  const radius = layout.discs[3 * disc + 2] ?? 0;
  const across = Math.max(tried.left - x, 0, x - tried.right);
  return Math.hypot(across, Math.max(tried.top - y, 0, y - tried.bottom)) < radius + PLACE.air;
}

function onLabel(layout: LabelLayout, other: number): boolean {
  const scale = layout.scale[other] ?? 1;
  against.left = layout.left[other] ?? 0;
  against.top = layout.top[other] ?? 0;
  against.right = against.left + (layout.width[other] ?? 0) * scale;
  against.bottom = against.top + (layout.height[other] ?? 0) * scale;
  return overBox();
}

const inside = ({ screenWidth, screenHeight }: LabelLayout) =>
  tried.left >= PLACE.margin &&
  tried.top >= PLACE.margin &&
  tried.right <= screenWidth - PLACE.margin &&
  tried.bottom <= screenHeight - PLACE.margin;

// Whether `tried` stands inside the screen and clear of every box, disc and label already shown.
function fits(layout: LabelLayout, slot: number): boolean {
  if (!inside(layout)) return false;
  for (let box = 0; box < Math.min(layout.boxCount, BOXES_MOST); box += 1) if (onBox(layout, box)) return false;
  for (let disc = 0; disc < Math.min(layout.discCount, DISCS_MOST); disc += 1)
    if (disc !== layout.own[slot] && onDisc(layout, disc)) return false;
  for (let other = 0; other < LABEL_SLOTS; other += 1)
    if (layout.shown[other] === 1 && onLabel(layout, other)) return false;
  return true;
}

function tryAt(layout: LabelLayout, slot: number, side: number): boolean {
  if (!standAt(layout, side) || !fits(layout, slot)) return false;
  layout.left[slot] = tried.left;
  layout.top[slot] = tried.top;
  layout.stem[slot] = tried.stem;
  layout.side[slot] = side;
  layout.shown[slot] = 1;
  return true;
}

function place(layout: LabelLayout, slot: number): void {
  depth(layout, slot);
  if (Number.isNaN(layout.away[slot] ?? NaN)) return;
  read(layout, slot);
  const kept = layout.side[slot] ?? -1;
  if (kept >= 0 && tryAt(layout, slot, kept)) return;
  for (let side = 0; side < SIDES; side += 1) if (side !== kept && tryAt(layout, slot, side)) return;
}

/** Stands each active slot's label, in `order`, where it shows; any other slot is hidden. */
export function settle(layout: LabelLayout): void {
  layout.shown.fill(0);
  for (let at = 0; at < LABEL_SLOTS; at += 1) {
    const slot = layout.order[at] ?? at;
    if (layout.active[slot] === 1) place(layout, slot);
  }
}

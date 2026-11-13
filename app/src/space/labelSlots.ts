import { LABEL_MS } from "../features/universe/arrivalBase.ts";
import { motionOf } from "./motion.ts";

// The names' pool: a name keeps its slot while it is chosen, and a slot is taken for another name only once the old one has faded out, so a
// name never changes in front of the reader (it fades out where it stands, and may come back while it does).
export interface Slot<Item, Button> {
  readonly button: Button;
  item: Item | undefined;
  // When the item was last chosen, and whether a new choice must not take it back (the lens said the names anew).
  seen: number;
  retired: boolean;
}

// raw: how long a name stays after it fell out of the choice (a world at a threshold's edge does not blink), and the fade's length, which
// is labels.module.css's --motion-label.
const HOLD_MS = 250;
const FADE_MS = LABEL_MS;

/** The lens said the names anew: the old ones fade out where they stand, and no new choice takes them back. */
export function retire(slots: readonly Slot<unknown, unknown>[]): void {
  for (const slot of slots) {
    slot.retired = true;
    slot.seen = Math.min(slot.seen, performance.now() - HOLD_MS);
  }
}

/** The slots, the scratch map of who holds which, and how a name is written into a slot. */
export interface Pool<Item, Button> {
  readonly slots: readonly Slot<Item, Button>[];
  readonly byItem: Map<Item, Slot<Item, Button>>;
  readonly name: (slot: Slot<Item, Button>, item: Item) => void;
}

/** Gives each of `items` its slot (its own, or a free one, written by `name`), stamps it now, and returns `held`, whether a slot is still shown: chosen
 * now or within the hold (none, under reduced motion), and `chosen`, whether it was chosen now. A slot is free once the hold and the fade have passed since it was chosen. */
export function assign<Item, Button>(
  { slots, byItem, name }: Pool<Item, Button>,
  items: readonly Item[],
): { held: (slot: Slot<Item, Button>) => boolean; chosen: (slot: Slot<Item, Button>) => boolean } {
  const now = performance.now();
  const held = motionOf().matches ? 0 : HOLD_MS;
  byItem.clear();
  for (const slot of slots) if (slot.item !== undefined && !slot.retired) byItem.set(slot.item, slot);
  for (const item of items) {
    let slot = byItem.get(item);
    if (slot === undefined) {
      slot = slots.find(({ item: used, seen }) => used === undefined || now - seen > held + FADE_MS);
      if (slot === undefined) continue;
      slot.retired = false;
      name(slot, item);
      byItem.set(item, slot);
    }
    slot.seen = now;
  }
  return { held: (slot) => now - slot.seen <= held, chosen: (slot) => slot.seen === now };
}

/** What says the names are at rest: when a name last came, went or moved, where each stands to a tenth of a pixel, and the settings the last
 * tick read. */
export class Rest {
  #busyAt = performance.now();
  #saw: readonly unknown[] = [];
  readonly #placed: Float32Array;

  constructor(slots: number) {
    this.#placed = new Float32Array(slots * 2).fill(-2);
  }

  /** Something came, went or moved just now. */
  busy(): void {
    this.#busyAt = performance.now();
  }

  /** Slot `index` is shown at `spot`, or not at all: a change from its last call is busy. */
  place(index: number, spot: { readonly x: number; readonly y: number } | undefined): void {
    const [px, py] = spot === undefined ? [-1, -1] : [Math.round(spot.x * 10), Math.round(spot.y * 10)];
    if (this.#placed[index * 2] !== px || this.#placed[index * 2 + 1] !== py) this.busy();
    this.#placed[index * 2] = px;
    this.#placed[index * 2 + 1] = py;
  }

  /** The settings this tick reads: a change from the last is busy. */
  read(settings: readonly unknown[]): void {
    if (this.#saw.length === 0 || settings.some((value, at) => value !== this.#saw[at])) this.busy();
    this.#saw = settings;
  }

  /** Whether `settings` are those last read and nothing was busy for a fade's length. */
  at(settings: readonly unknown[]): boolean {
    return settings.every((value, at) => value === this.#saw[at]) && performance.now() - this.#busyAt > FADE_MS + 50;
  }
}

// A name no one sees is no button to a screen reader: an idle pool slot has no words, a fading one is leaving. Written only on a change.
export function expose(button: HTMLButtonElement, shown: boolean): void {
  if ((button.getAttribute("aria-hidden") === "true") !== shown) return;
  if (shown) button.removeAttribute("aria-hidden");
  else button.setAttribute("aria-hidden", "true");
}

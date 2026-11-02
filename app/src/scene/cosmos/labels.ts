// The cosmos's labels on the page (frame 4; ADR-0002 §9: HTML labels pooled, never made each frame; slice 7 §3: text only): eight elements
// made once, in a layer of their own over the canvas, hidden from readers, for the page's list says where each place is. Their words are
// written as text, ten times a second at most; each frame moves them beside their bodies as core/lod settles them, clear of each other, of
// the page's bands and of the bodies.
import { LABEL_SLOTS, LabelLayout, settle, toScene, type ClearBox, type Point, type ScreenSpot } from "@gnoworld/core";
import { Vector3 } from "three";
import { fadeTo, moveTo, slotIn, wordsInto, type Anchor, type Chosen, type Slot } from "./labelSlot.ts";
import styles from "./labels.module.css";

export type { Anchor, Chosen };

const WORDS_MS = 100;
// The bands the page keeps at 1,080 high, frames 4 and 17: the header's 9%, the ticker's 34 px, the rail's 143 px and its 25 of margin.
const HEADER = 0.09;
const TICKER = 34;
const RAIL = 168;
const RAIL_FROM = 900;
// A distant star's room on screen, in pixels, whatever its distance.
const STAR_PIXELS = 4;

interface Sight {
  readonly width: number;
  readonly height: number;
  readonly box: ClearBox | undefined;
}

/** Where a round thing from the eye stands on screen, and its depth, on the screen it sees: the bodies' own projection. */
export interface Projector {
  seen(at: Vector3, radius: number): ScreenSpot & { readonly depth: number };
  readonly sight: Sight;
}

const unseen = (at: Anchor | Point | undefined) => at === undefined || ("visible" in at && !at.visible);

export class Labels {
  readonly #layer: HTMLElement;
  readonly #slots: Slot[];
  readonly #projector: Projector;
  readonly #layout = new LabelLayout();
  readonly #onStage = { x: 0, y: 0, z: 0 };
  readonly #star = new Vector3();
  #sight: Sight = { width: 0, height: 0, box: undefined };
  readonly #bands = new Float64Array(16);
  #bandCount = 0;
  #waiting: readonly Chosen[] | undefined;
  #timer: ReturnType<typeof setTimeout> | undefined;
  #wrote = Number.NEGATIVE_INFINITY;
  #watching: MutationObserver | undefined;
  // Every body the view draws: a label keeps off those that have none of their own too.
  #around: readonly Anchor[] = [];

  constructor(document: Document, projector: Projector) {
    this.#projector = projector;
    this.#layer = document.createElement("div");
    this.#layer.className = styles["layer"] ?? "";
    this.#layer.setAttribute("aria-hidden", "true");
    this.#layer.dataset["labels"] = "";
    this.#slots = Array.from({ length: LABEL_SLOTS }, () => slotIn(this.#layer, document));
    document.body.append(this.#layer);
    this.#mirror(document.querySelector("canvas[data-scene]"));
  }

  // The layer shows only while the scene's canvas runs: a lost context or a covered page stops the frames that would hide it.
  #mirror(canvas: Element | null): void {
    if (canvas === null) return;
    const running = () => {
      this.#layer.hidden = canvas.getAttribute("data-scene") !== "on";
    };
    this.#watching = new MutationObserver(running);
    this.#watching.observe(canvas, { attributes: true, attributeFilter: ["data-scene"] });
    running();
  }

  // The screen, in the page's pixels, and the box of the page's text: its bands written once a change.
  #view(sight: Sight): void {
    const { width, height, box } = sight;
    this.#sight = sight;
    const bands = [
      [0, 0, width, HEADER * height],
      [0, height - TICKER, width, height],
      ...(width >= RAIL_FROM ? [[width - RAIL, 0, width, height]] : []),
      ...(box === undefined ? [] : [[box.left, box.top, box.right, box.bottom]]),
    ];
    this.#bandCount = bands.length;
    this.#bands.set(bands.flat());
  }

  /** The labels a look chose, in their order: written at once, or within a tenth of a second of the last words. */
  show(chosen: readonly Chosen[], around: readonly Anchor[] = []): void {
    this.#around = around;
    this.#leave(chosen);
    this.#waiting = chosen;
    if (this.#timer !== undefined) return;
    const wait = this.#wrote + WORDS_MS - Date.now();
    if (wait <= 0) this.#apply();
    else this.#timer = setTimeout(this.#apply, wait);
  }

  // A world no longer chosen lets its slot go at once: only words wait.
  #leave(chosen: readonly Chosen[]): void {
    const kept = new Set(chosen.map(({ label }) => label.id));
    for (const slot of this.#slots)
      if (slot.chosen !== undefined && !kept.has(slot.chosen.label.id)) slot.chosen = undefined;
  }

  readonly #apply = (): void => {
    this.#timer = undefined;
    const chosen = (this.#waiting ?? []).slice(0, LABEL_SLOTS);
    this.#waiting = undefined;
    this.#wrote = Date.now();
    this.#leave(chosen);
    chosen.forEach((each, order) => {
      const slot =
        this.#slots.find((one) => one.chosen?.label.id === each.label.id) ??
        this.#slots.find((one) => one.chosen === undefined);
      if (slot === undefined) return;
      wordsInto(slot, each, { layout: this.#layout, index: this.#slots.indexOf(slot) });
      this.#layout.order[order] = this.#slots.indexOf(slot);
    });
    const used = new Set(chosen.map((_, order) => this.#layout.order[order]));
    let next = chosen.length;
    for (let index = 0; index < LABEL_SLOTS; index += 1) if (!used.has(index)) this.#layout.order[next++] = index;
  };

  /** One frame on, from `eye`, in doubles: each label beside its body, or every one hidden where the view draws no bodies. */
  tick(eye: Point, shown: boolean): void {
    const layout = this.#layout;
    if (this.#projector.sight !== this.#sight) this.#view(this.#projector.sight);
    layout.screenWidth = this.#sight.width;
    layout.screenHeight = this.#sight.height;
    layout.discCount = 0;
    for (let index = 0; index < LABEL_SLOTS; index += 1) this.#aim(index, eye, shown);
    for (let at = 0; at < this.#around.length; at += 1) this.#keepOff(this.#around[at]);
    this.#keep();
    settle(layout);
    for (let index = 0; index < LABEL_SLOTS; index += 1) this.#place(index);
  }

  #aim(index: number, eye: Point, shown: boolean): void {
    const layout = this.#layout;
    const at = this.#slots[index]?.chosen?.at;
    layout.active[index] = 0;
    layout.own[index] = -1;
    if (!shown || at === undefined || unseen(at)) return;
    const body = "position" in at;
    const place = body ? at.position : this.#starFrom(at, eye);
    const { x, y, radius, depth } = this.#projector.seen(place, body ? at.scale.x : 0);
    if (!(depth > 0)) return;
    layout.active[index] = 1;
    layout.x[index] = x;
    layout.y[index] = y;
    layout.radius[index] = Math.max(radius, STAR_PIXELS);
    layout.away[index] = place.length();
    if (body) this.#disc(index, radius);
  }

  // A distant star's place from the eye, in the vector kept for it.
  #starFrom(at: Point, eye: Point): Vector3 {
    toScene(at, this.#onStage);
    return this.#star.set(this.#onStage.x - eye.x, this.#onStage.y - eye.y, this.#onStage.z - eye.z);
  }

  // A body with no label of its own, kept clear of every label.
  #keepOff(body: Anchor | undefined): void {
    if (body === undefined || !body.visible || this.#slots.some(({ chosen }) => chosen?.at === body)) return;
    const { x, y, radius, depth } = this.#projector.seen(body.position, body.scale.x);
    const layout = this.#layout;
    if (!(depth > 0) || radius < 2 || layout.discCount >= layout.discs.length / 3) return;
    const disc = 3 * layout.discCount;
    layout.discs[disc] = x;
    layout.discs[disc + 1] = y;
    layout.discs[disc + 2] = radius;
    layout.discCount += 1;
  }

  // A body's disc, kept clear of every other label.
  #disc(index: number, radius: number): void {
    const layout = this.#layout;
    if (layout.discCount >= layout.discs.length / 3) return;
    const disc = 3 * layout.discCount;
    layout.own[index] = layout.discCount;
    layout.discs[disc] = layout.x[index] ?? 0;
    layout.discs[disc + 1] = layout.y[index] ?? 0;
    layout.discs[disc + 2] = radius;
    layout.discCount += 1;
  }

  // The page's bands and the box of its text, kept clear: written when the screen changes, copied on a frame.
  #keep(): void {
    for (let at = 0; at < 4 * this.#bandCount; at += 1) this.#layout.boxes[at] = this.#bands[at] ?? 0;
    this.#layout.boxCount = this.#bandCount;
  }

  #place(index: number): void {
    const slot = this.#slots[index];
    if (slot === undefined) return;
    const shown = this.#layout.shown[index] === 1;
    fadeTo(slot, shown, Math.round((this.#layout.fade[index] ?? 1) * 100) / 100);
    if (shown) moveTo(slot, this.#layout, index);
  }

  /** The layout and each slot's label, for the tests and the journeys to read: kept small, for it ships. */
  stats() {
    return { layout: this.#layout, labels: this.#slots.map(({ chosen }) => chosen?.label) };
  }

  /** Takes its layer off the page, and its waiting words. */
  dispose(): void {
    clearTimeout(this.#timer);
    this.#timer = undefined;
    this.#watching?.disconnect();
    this.#layer.remove();
  }
}

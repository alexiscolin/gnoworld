// One label of the cosmos's pool (7h): a pill made once with its three words, written as text when they change, and moved, faded and turned
// on a frame only where a value changed. Nothing here is made on a frame but the one string a moved label's place needs.
import type { Label, LabelLayout, Point } from "@gnoworld/core";
import type { Vector3 } from "three";
import styles from "./labels.module.css";

/** What a body's label stands by: its place from the eye and its radius, kept up to date by what draws it. */
export interface Anchor {
  readonly position: Vector3;
  readonly scale: { readonly x: number };
  readonly visible: boolean;
}

/** A label and what it points at: a body, or a distant star's place on the map. */
export interface Chosen {
  readonly label: Label;
  readonly at: Anchor | Point;
}

export interface Slot {
  readonly element: HTMLElement;
  readonly words: readonly [HTMLElement, HTMLElement, HTMLElement];
  chosen: Chosen | undefined;
  /** What was last written: left, top, scale, opacity, stem, below, the words' fade. */
  readonly written: Float64Array;
}

/** A label made once in `layer`, hidden. */
export function slotIn(layer: HTMLElement, document: Document): Slot {
  const element = document.createElement("div");
  const word = (name: string | undefined) => {
    const part = document.createElement("span");
    part.className = name ?? "";
    return element.appendChild(part);
  };
  const words = [word(styles["title"]), word(styles["count"]), word(styles["badge"])] as const;
  element.className = styles["label"] ?? "";
  element.style.setProperty("opacity", "0");
  layer.append(element);
  return { element, words, chosen: undefined, written: new Float64Array(7).fill(Number.NaN) };
}

/** Gives `slot` what `chosen` says, its words written as text and measured only when they changed. */
export function wordsInto(slot: Slot, chosen: Chosen, size: { layout: LabelLayout; index: number }): void {
  const before = slot.chosen?.label;
  slot.chosen = chosen;
  const { title, count, badge, uncharted } = chosen.label;
  if (before?.title === title && before.count === count && before.badge === badge && before.uncharted === uncharted)
    return;
  const [titled, counted, badged] = slot.words;
  titled.textContent = title;
  counted.textContent = count;
  badged.textContent = badge;
  slot.element.classList.toggle(styles["uncharted"] ?? "uncharted", uncharted);
  size.layout.width[size.index] = slot.element.offsetWidth;
  size.layout.height[size.index] = slot.element.offsetHeight;
}

/** Shows or hides `slot`, and fades its words with depth, never its pill (frame 4's are solid); an uncharted signal's words never fade.
 * Written only when it changed. */
export function fadeTo({ element, written, chosen }: Slot, shown: boolean, fade: number): void {
  const opacity = shown ? 1 : 0;
  const words = chosen?.label.uncharted === true ? 1 : fade;
  if (written[3] !== opacity) element.style.setProperty("opacity", String(opacity));
  if (written[6] !== words) element.style.setProperty("--_fade", String(words));
  written[3] = opacity;
  written[6] = words;
}

// Writes a shown label's place, at a tenth of a pixel and a thousandth of its scale, only when it moved.
function placeAt({ element, written }: Slot, layout: LabelLayout, index: number): void {
  const left = Math.round((layout.left[index] ?? 0) * 10) / 10;
  const top = Math.round((layout.top[index] ?? 0) * 10) / 10;
  const scale = Math.round((layout.scale[index] ?? 1) * 1000) / 1000;
  if (written[0] !== left || written[1] !== top || written[2] !== scale)
    element.style.setProperty(
      "transform",
      "translate(" + String(left) + "px, " + String(top) + "px) scale(" + String(scale) + ")",
    );
  written[0] = left;
  written[1] = top;
  written[2] = scale;
}

/** Moves a shown label where `layout` stands it, its stem and its side with it. */
export function moveTo(slot: Slot, layout: LabelLayout, index: number): void {
  const { element, written } = slot;
  placeAt(slot, layout, index);
  const stem = Math.round(layout.stem[index] ?? 0);
  const below = (layout.side[index] ?? 0) >= 2 ? 1 : 0;
  if (written[4] !== stem) element.style.setProperty("--_stem", String(stem) + "px");
  if (written[5] !== below) element.classList.toggle(styles["below"] ?? "below", below === 1);
  written[4] = stem;
  written[5] = below;
}

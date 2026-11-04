// The whole cosmos's names (web.ts; 7u): the cosmos's own pills (labels.module.css, the video's) over the biggest clumps, each its
// namespace and its worlds; on a phone the four biggest alone (the chief, 2026-11-04), so none crowds or runs off its edge. A pill that
// would cover another, or the page's text, stays hidden, the biggest first. Over the canvas, taking no pointer.
import type { ClearBox, Clump, Point } from "@gnoworld/core";
import type { Vector3 } from "three";
import styles from "./labels.module.css";

const NAMED = 12;
const MOST = 12;
const PHONE_PX = 600;
const PHONE_MOST = 4;
const GAP = 6;

const shortOf = (name: string) => (name.startsWith("g1") ? `${name.slice(0, 6)}…${name.slice(-4)}` : name);
const overlaps = (a: DOMRect, b: DOMRect) =>
  a.left < b.right + GAP && a.right > b.left - GAP && a.top < b.bottom + GAP && a.bottom > b.top - GAP;

/** The window in its pixels, and the page's text's box, which no pill stands in. */
interface Screen {
  readonly width: number;
  readonly height: number;
  readonly box: ClearBox | undefined;
}
const over = (rect: DOMRect, box: ClearBox | undefined) =>
  box !== undefined && rect.left < box.right && rect.right > box.left && rect.top < box.bottom && rect.bottom > box.top;

export class WebNames {
  readonly #document: Document;
  readonly #layer: HTMLDivElement;
  #pills: { readonly box: HTMLElement; readonly clump: Clump }[] = [];

  constructor(document: Document) {
    this.#document = document;
    this.#layer = document.createElement("div");
    this.#layer.className = styles["layer"] ?? "";
    this.#layer.setAttribute("aria-hidden", "true");
    this.#layer.hidden = true;
    document.body.append(this.#layer);
  }

  /** A pill for each of the biggest clumps, the biggest first. */
  stand(clumps: readonly Clump[]): void {
    const made = (tag: string, text: string, name: string) =>
      Object.assign(this.#document.createElement(tag), { textContent: text, className: name });
    this.#layer.replaceChildren();
    this.#pills = [...clumps]
      .filter(({ real }) => real >= NAMED)
      .sort((a, b) => b.real - a.real)
      .slice(0, MOST)
      .map((clump) => {
        const box = made("div", "", `${styles["placed"] ?? ""} ${styles["label"] ?? ""}`);
        const count = `${String(clump.worlds)} world${clump.worlds === 1 ? "" : "s"}`;
        box.append(made("span", shortOf(clump.id), styles["title"] ?? ""), made("span", count, styles["count"] ?? ""));
        this.#layer.append(box);
        return { box, clump };
      });
  }

  show(shown: boolean): void {
    this.#layer.hidden = !shown;
  }

  /** Each pill over its clump through `project` (to the view's -1 to 1), the biggest first, one that would cover another or the box hidden. */
  place(project: (at: Point) => Vector3, { width, height, box: clear }: Screen): void {
    const taken: DOMRect[] = [];
    const most = width < PHONE_PX ? PHONE_MOST : MOST;
    this.#pills.forEach(({ box, clump }, rank) => {
      const at = project({ x: clump.centre.x, y: clump.centre.y + clump.radius * 0.7, z: clump.centre.z });
      const [x, y] = [((at.x + 1) * width) / 2, ((1 - at.y) * height) / 2];
      box.style.display = "";
      box.style.transform = `translate(${String(Math.round(x))}px, ${String(Math.round(y))}px) translate(-50%, -100%)`;
      const rect = box.getBoundingClientRect();
      const inside = rect.left >= 0 && rect.right <= width && at.z < 1;
      const shown = rank < most && inside && !taken.some((other) => overlaps(rect, other)) && !over(rect, clear);
      // The pill's own display outweighs the hidden attribute: it goes by its style.
      box.style.display = shown ? "" : "none";
      if (shown) taken.push(rect);
    });
  }

  dispose(): void {
    this.#layer.remove();
  }
}

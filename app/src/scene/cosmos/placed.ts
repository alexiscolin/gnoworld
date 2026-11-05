// Names placed over the scene by their translate (7v, 7x2): each moved from the layer's corner, written only when it moved by a tenth of a
// pixel, so a still frame touches no style. A Plan's names and the stations' share it.

export class Placed {
  #elements: readonly HTMLElement[] = [];
  // Where each was written last, across and down, in the page's pixels to a tenth.
  #written = new Float64Array(0);

  /** Places `elements` from now on, none written yet. */
  set(elements: readonly HTMLElement[]): void {
    this.#elements = elements;
    this.#written = new Float64Array(2 * elements.length).fill(NaN);
  }

  /** Moves element `at` to `x`, `y` in the page's pixels. */
  place(at: number, x: number, y: number): void {
    const left = Math.round(x * 10) / 10;
    const top = Math.round(y * 10) / 10;
    if (this.#written[2 * at] === left && this.#written[2 * at + 1] === top) return;
    this.#written[2 * at] = left;
    this.#written[2 * at + 1] = top;
    this.#elements[at]?.style.setProperty("transform", "translate(" + String(left) + "px, " + String(top) + "px)");
  }
}

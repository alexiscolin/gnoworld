// The labels the page's reactions take on Ergo (labeled-response, slice 4's 4d): each once, so Ergo's answer to one is
// known by it.
export class Labels {
  #count = 0;

  /** The label the next one takes. */
  next(): string {
    return `r${String(this.#count + 1)}`;
  }

  /** The next label went out. */
  sent(): void {
    this.#count += 1;
  }
}

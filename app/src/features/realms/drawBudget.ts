// What a realm page may draw: the budget a page's blocks, items and nodes are counted against, and what the drawing of
// each shares.
import type { Inline } from "@gnoworld/core";
import type { Drawing } from "../chat/index.ts";

/** The most blocks, list items and form fields a page draws, and the most inline nodes in them: 256 KB of `*a* ` is
 * 195,000 React elements, a stack overflow once spread. Past either, the page says so and links to the rest. */
export const DRAW_LIMIT = 2000;
export const INLINE_LIMIT = 10_000;

// How many inline nodes `nodes` hold, nested ones too.
export const weigh = (nodes: readonly Inline[]): number =>
  nodes.reduce((sum, node) => sum + 1 + ("children" in node ? weigh(node.children) : 0), 0);

// What is left to draw, and whether something was left out: once one thing was, nothing after it is drawn, so a page never
// has a hole with its later text below it.
export class Budget {
  #blocks = DRAW_LIMIT;
  #nodes = INLINE_LIMIT;
  cut = false;

  /** Whether one more unit, holding `nodes` inline nodes, fits; if so, it is spent. */
  spend(nodes: number): boolean {
    const fits = !this.cut && this.#blocks >= 1 && this.#nodes >= nodes;
    if (fits) {
      this.#blocks -= 1;
      this.#nodes -= nodes;
    } else this.cut = true;
    return fits;
  }

  /** The leading `items` that fit, each weighing what `weight` says. */
  fit<T>(items: readonly T[], weight: (item: T) => number): T[] {
    const kept: T[] = [];
    for (const item of items) {
      if (!this.spend(weight(item))) break;
      kept.push(item);
    }
    return kept;
  }
}

/** What drawing a block needs: the budget, the chat's drawing with this page's reader. */
export interface Ink {
  readonly budget: Budget;
  readonly via: Drawing;
  readonly reader: Drawing["reader"];
}

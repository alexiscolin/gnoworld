// A realm page's tree as elements (5h): core's allowlisted blocks, each an element of the list, every text React's text,
// so nothing from a realm reaches HTML. Marks, paragraphs, code and lists are drawn by the chat's own drawing (one
// place), a heading at its level, a form read only (RealmForm). A link opens its address in a new tab, no opener and no
// referrer, as the chat's does.
import type { Inline, PageBlock } from "@gnoworld/core";
import { createElement, type ReactNode } from "react";
import type { Drawing } from "../chat/index.ts";
import styles from "./RealmBlocks.module.css";
import { RealmForm } from "./RealmForm.tsx";

const HEADINGS = { 1: "h1", 2: "h2", 3: "h3", 4: "h4", 5: "h5", 6: "h6" } as const;

/** The most blocks, list items and form fields a page draws, and the most inline nodes in them: 256 KB of `*a* ` is
 * 195,000 React elements, a stack overflow once spread. Past either, the page says so and links to the rest. */
export const DRAW_LIMIT = 2000;
export const INLINE_LIMIT = 10_000;

// How many inline nodes `nodes` hold, nested ones too.
const weigh = (nodes: readonly Inline[]): number =>
  nodes.reduce((sum, node) => sum + 1 + ("children" in node ? weigh(node.children) : 0), 0);

// What is left to draw, and whether something was left out.
class Budget {
  #blocks = DRAW_LIMIT;
  #nodes = INLINE_LIMIT;
  cut = false;

  /** Whether one more unit, holding `nodes` inline nodes, fits; if so, it is spent. */
  spend(nodes: number): boolean {
    const fits = this.#blocks >= 1 && this.#nodes >= nodes;
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

const inlinesOf = (block: PageBlock): readonly Inline[] =>
  block.type === "paragraph" || block.type === "heading" ? block.children : [];

function drawAll(blocks: readonly PageBlock[], budget: Budget, via: Drawing): ReactNode[] {
  const drawn: ReactNode[] = [];
  for (const block of blocks) {
    if (!budget.spend(weigh(inlinesOf(block)))) break;
    drawn.push(draw(block, budget, via));
  }
  return drawn;
}

function draw(block: PageBlock, budget: Budget, via: Drawing): ReactNode {
  switch (block.type) {
    case "heading":
      return createElement(HEADINGS[block.level], null, ...via.inlines(block.children, via.reader));
    case "form":
      return createElement(RealmForm, { exec: block.exec, fields: budget.fit(block.fields, () => 0) });
    case "quote":
      return createElement("blockquote", null, ...drawAll(block.children, budget, via));
    case "list":
      return via.block({ ...block, items: budget.fit(block.items, weigh) }, via.reader);
    case "paragraph":
    case "codeBlock":
      return via.block(block, via.reader);
  }
}

/** A page's blocks, in order, in the page's own column; `more` is the address of the page on gnoweb, which a page cut at
 * the limit links to. */
export function RealmBlocks({ blocks, more, via }: { blocks: readonly PageBlock[]; more?: string; via: Drawing }) {
  const budget = new Budget();
  const drawn = drawAll(blocks, budget, via);
  const notice = budget.cut
    ? createElement(
        "p",
        { key: "cut", className: styles["cut"], "data-cut": "" },
        "The rest of this page is not shown here.",
        more === undefined
          ? undefined
          : createElement("a", { href: more, target: "_blank", rel: "noopener noreferrer" }, " Read it on gnoweb"),
      )
    : undefined;
  return createElement("div", { className: styles["page"] }, ...drawn, notice);
}

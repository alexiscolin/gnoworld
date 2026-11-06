// A realm page's tree as elements (5h): core's allowlisted blocks, each an element of the list, every text React's text,
// so nothing from a realm reaches HTML. Marks, paragraphs, code and lists are drawn by the chat's own drawing (one
// place), a heading at its level, a form read only (RealmForm) or, in a realm's own view, with its Call (CallableForm). A link on gnoweb's own origin opens there in a new tab, no
// opener and no referrer; any other is a button that asks first, naming the host it goes to (ExternalLink).
import type { Inline, PageBlock } from "@gnoworld/core";
import { createElement, lazy, Suspense, type ReactNode } from "react";
import type { Drawing } from "../chat/index.ts";
import { useExternalLinks } from "./useExternalLinks.tsx";
import styles from "./RealmBlocks.module.css";
import type { CallPlace } from "./InlineCard.tsx";
import { RealmForm } from "./RealmForm.tsx";

// A form with its Call is the realm view's own, never a capture's or a chat's: the call card's code comes only as one is drawn.
const CallableForm = lazy(async () => ({ default: (await import("./CallableForm.tsx")).CallableForm }));

// A form's card, one level under the heading before it, and no deeper than a card's title goes.
const CARD_LEVEL = { 1: 2, 2: 3, 3: 4, 4: 4, 5: 4, 6: 4 } as const;
const HEADINGS = { 1: "h1", 2: "h2", 3: "h3", 4: "h4", 5: "h5", 6: "h6" } as const;

/** The most blocks, list items and form fields a page draws, and the most inline nodes in them: 256 KB of `*a* ` is
 * 195,000 React elements, a stack overflow once spread. Past either, the page says so and links to the rest. */
export const DRAW_LIMIT = 2000;
export const INLINE_LIMIT = 10_000;

// How many inline nodes `nodes` hold, nested ones too.
const weigh = (nodes: readonly Inline[]): number =>
  nodes.reduce((sum, node) => sum + 1 + ("children" in node ? weigh(node.children) : 0), 0);

// What is left to draw, and whether something was left out: once one thing was, nothing after it is drawn, so a page never
// has a hole with its later text below it.
class Budget {
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

/** What drawing a page needs besides its blocks: the budget, the chat's drawing with this page's reader. */
interface Drawn {
  readonly budget: Budget;
  readonly via: Drawing;
  readonly reader: Drawing["reader"];
  readonly call: CallPlace | undefined;
  /** The level of the last heading drawn, which a form's card sits under. */
  readonly under: { level: 1 | 2 | 3 | 4 | 5 | 6 };
}

const inlinesOf = (block: PageBlock): readonly Inline[] =>
  block.type === "paragraph" || block.type === "heading" ? block.children : [];

function drawAll(blocks: readonly PageBlock[], on: Drawn): ReactNode[] {
  const drawn: ReactNode[] = [];
  for (const block of blocks) {
    if (!on.budget.spend(weigh(inlinesOf(block)))) break;
    const node = draw(block, on);
    if (node !== undefined) drawn.push(node);
  }
  return drawn;
}

// A block as an element; none for a list or a quote left empty, which would be a hole in the page.
function draw(block: PageBlock, on: Drawn): ReactNode {
  const { budget, via, reader, call, under } = on;
  switch (block.type) {
    case "heading":
      under.level = block.level;
      return createElement(HEADINGS[block.level], null, ...via.inlines(block.children, reader));
    case "form": {
      const fields = budget.fit(block.fields, () => 0);
      const form = { exec: block.exec, path: block.path, fields, left: block.fields.length - fields.length };
      return call === undefined
        ? createElement(RealmForm, form)
        : createElement(
            Suspense,
            { fallback: null },
            createElement(CallableForm, { ...form, call, level: CARD_LEVEL[under.level] }),
          );
    }
    case "quote": {
      const inside = drawAll(block.children, on);
      return inside.length === 0 ? undefined : createElement("blockquote", null, ...inside);
    }
    case "list": {
      const items = budget.fit(block.items, weigh);
      return items.length === 0 ? undefined : via.block({ ...block, items }, reader);
    }
    case "paragraph":
    case "codeBlock":
      return via.block(block, reader);
  }
}

/** A page's blocks, in order, in the page's own column. `origin` is gnoweb's, which a link stays an anchor on; `more` is the
 * address of the page on gnoweb, which a page cut at the limit links to. */
export function RealmBlocks({
  blocks,
  origin,
  more,
  via,
  call,
}: {
  blocks: readonly PageBlock[];
  origin?: string;
  more?: string;
  via: Drawing;
  /** The realm the page is of: with it, a form a call can carry gets its Call (9e). */
  call?: CallPlace;
}) {
  const warning = useExternalLinks(origin);
  const budget = new Budget();
  const reader = { ...via.reader, link: warning.link };
  const drawn = drawAll(blocks, { budget, via, reader, call, under: { level: 1 } });
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
  return createElement("div", { className: styles["page"] }, ...drawn, notice, warning.dialog);
}

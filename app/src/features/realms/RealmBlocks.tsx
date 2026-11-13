// A realm page's tree as elements (5h): core's allowlisted blocks, every text React's text, nothing from a realm reaches
// HTML. Marks, paragraphs, code and flat lists are the chat's drawing; a rule is an hr, a nested or task list lists with
// read-only boxes, an image a card linking to it (never loaded: a third party's picture leaks the visitor's address, and
// the CSP has none), an alert a notice, a form read only (RealmForm) or, in a realm's view, with its Call (CallableForm).
// A link on gnoweb's origin opens there in a new tab; any other is a button that asks first (ExternalLink).
import type { Inline, PageBlock } from "@gnoworld/core";
import { Icon } from "@gnoworld/ui";
import { NEW_TAB } from "../../lib/newTab.ts";
import { createElement, Fragment, lazy, Suspense, useId, type ReactNode } from "react";
import type { Drawing } from "../chat/index.ts";
import { Budget, weigh, type Ink } from "./drawBudget.ts";
import { drawInlines, outline } from "./RealmLists.ts";
import { useExternalLinks } from "./useExternalLinks.tsx";
import styles from "./RealmBlocks.module.css";
export { DRAW_LIMIT, INLINE_LIMIT } from "./drawBudget.ts";
import type { CallPlace } from "./InlineCard.tsx";
import { RealmForm } from "./RealmForm.tsx";

// A form with its Call is the realm view's own, never a capture's or a chat's: the call card's code comes only as one is drawn.
const CallableForm = lazy(async () => ({ default: (await import("./CallableForm.tsx")).CallableForm }));

// A form's card, one level under the heading before it, and no deeper than a card's title goes.
const CARD_LEVEL = { 1: 2, 2: 3, 3: 4, 4: 4, 5: 4, 6: 4 } as const;
const HEADINGS = { 1: "h1", 2: "h2", 3: "h3", 4: "h4", 5: "h5", 6: "h6" } as const;

/** What drawing a page needs besides its blocks. */
interface Drawn extends Ink {
  readonly call: CallPlace | undefined;
  /** The forms taken out of the text, in order, each under its anchor: drawn after the page's blocks. */
  readonly forms: ReactNode[];
  /** What a form's anchor starts with: this page's, so two pages of one document never share one. */
  readonly anchor: string;
  /** The level of the last heading drawn, which a form's card sits under. */
  readonly under: { level: 1 | 2 | 3 | 4 | 5 | 6 };
}

const inlinesOf = (block: PageBlock): readonly Inline[] => {
  return block.type === "paragraph" || block.type === "heading" ? block.children : [];
};

// What a row costs: a unit for each cell it is drawn with (the head's width, a short row filled), and the nodes in them, so a
// table of empty cells is no free page.
const rowWeight =
  (width: number) =>
  (row: readonly Inline[][]): number =>
    width + weigh(row.flat());

const NOTICE_ICON = { notice: "info", caution: "warning" } as const;

// A table in a region of its own, which a keyboard can reach and scroll; its rows as many as the budget has.
function table(block: Extract<PageBlock, { type: "table" }>, { budget, via, reader }: Drawn): ReactNode {
  const cell = (tag: "th" | "td", nodes: Inline[], n: number) =>
    createElement(
      tag,
      {
        scope: tag === "th" ? "col" : undefined,
        "data-align": block.align[n] === "none" ? undefined : block.align[n],
      },
      ...drawInlines(nodes, { via, reader }),
    );
  const rows = budget.fit(block.rows, rowWeight(block.head.length));
  const head = createElement("thead", null, createElement("tr", null, ...block.head.map((c, n) => cell("th", c, n))));
  const body = createElement(
    "tbody",
    null,
    ...rows.map((row) => createElement("tr", null, ...block.head.map((_, n) => cell("td", row[n] ?? [], n)))),
  );
  const region = createElement(
    "div",
    { className: styles["scroll"], role: "region", "aria-label": "Table", tabIndex: 0 },
    createElement("table", null, head, body),
  );
  const left = block.cut || rows.length < block.rows.length;
  return left
    ? createElement(
        Fragment,
        null,
        region,
        createElement("p", { className: "meta" }, "The rest of this table is not shown here."),
      )
    : region;
}

function drawAll(blocks: readonly PageBlock[], on: Drawn): ReactNode[] {
  const drawn: ReactNode[] = [];
  for (const block of blocks) {
    if (!on.budget.spend(block.type === "table" ? rowWeight(block.head.length)(block.head) : weigh(inlinesOf(block))))
      break;
    const node = draw(block, on);
    if (node !== undefined) drawn.push(node);
  }
  return drawn;
}

// A quote, or an alert as a notice; none for one left empty.
function quote(block: Extract<PageBlock, { type: "quote" }>, on: Drawn): ReactNode {
  const inside = drawAll(block.children, on);
  if (inside.length === 0) return undefined;
  if (block.severity === undefined) return createElement("blockquote", null, ...inside);
  return createElement(
    "aside",
    { className: styles["notice"], "data-severity": block.severity },
    createElement(Icon, { name: NOTICE_ICON[block.severity] }),
    createElement("div", { className: styles["noticeBody"] }, ...inside),
  );
}

// A form's card: read only, or, in a realm's own view, with its Call.
function card(block: Extract<PageBlock, { type: "form" }>, { budget, call, under }: Drawn): ReactNode {
  const fields = budget.fit(block.fields, () => 0);
  const shown = { exec: block.exec, path: block.path, fields, left: block.fields.length - fields.length };
  return call === undefined
    ? createElement(RealmForm, shown)
    : createElement(
        Suspense,
        { fallback: null },
        createElement(CallableForm, { ...shown, call, level: CARD_LEVEL[under.level] }),
      );
}

// A form is taken out of the text and drawn after it, under its anchor; where it stood, a line points to it. The form is the
// same, read only or with its Call: only its place changes.
function form(block: Extract<PageBlock, { type: "form" }>, on: Drawn): ReactNode {
  const id = `${on.anchor}-form-${String(on.forms.length)}`;
  on.forms.push(createElement("div", { id, key: id }, card(block, on)));
  const title = block.exec === "" ? "Form" : `Form: ${block.exec}`;
  return createElement("p", null, createElement("a", { href: `#${id}`, dir: "ltr" }, `${title} \u2193`));
}

// Columns side by side, each its blocks; none when they hold nothing.
function columns(block: Extract<PageBlock, { type: "columns" }>, on: Drawn): ReactNode {
  const each: ReactNode[] = [];
  for (const column of block.columns) {
    if (on.budget.cut) break;
    each.push(createElement("div", null, ...drawAll(column, on)));
  }
  return createElement("div", { className: styles["columns"], "data-block": "columns" }, ...each);
}

// The chat's flat list, its items as many as the budget has.
function list(block: Extract<PageBlock, { type: "list" }>, { budget, via, reader }: Drawn): ReactNode {
  const items = budget.fit(block.items, weigh);
  return items.length === 0 ? undefined : via.block({ ...block, items }, reader);
}

type Leaf = Extract<PageBlock, { type: "heading" | "rule" | "paragraph" | "codeBlock" }>;
const isLeaf = (block: PageBlock): block is Leaf => ["heading", "rule", "paragraph", "codeBlock"].includes(block.type);

// A heading, a rule, a paragraph or code: no block inside.
function leaf(block: Leaf, on: Drawn): ReactNode {
  switch (block.type) {
    case "heading":
      on.under.level = block.level;
      return createElement(HEADINGS[block.level], null, ...drawInlines(block.children, on));
    case "rule":
      return createElement("hr");
    case "paragraph":
      return createElement("p", null, ...drawInlines(block.children, on));
    case "codeBlock":
      return on.via.block(block, on.reader);
  }
}

// A block as an element; none for a list or a quote left empty, which would be a hole in the page.
function draw(block: PageBlock, on: Drawn): ReactNode {
  if (isLeaf(block)) return leaf(block, on);
  switch (block.type) {
    case "form":
      return form(block, on);
    case "quote":
      return quote(block, on);
    case "list":
      return list(block, on);
    case "table":
      return table(block, on);
    case "columns":
      return columns(block, on);
    case "outline":
      return outline(block, on);
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
  const anchorId = useId();
  const forms: ReactNode[] = [];
  const drawn = drawAll(blocks, { budget, via, reader, call, forms, anchor: anchorId, under: { level: 1 } });
  const below =
    forms.length === 0
      ? undefined
      : createElement("section", { className: styles["forms"], "aria-label": "Forms" }, ...forms);
  const notice = budget.cut
    ? createElement(
        "p",
        { key: "cut", className: "meta", "data-cut": "" },
        "The rest of this page is not shown here.",
        more === undefined ? undefined : createElement("a", { href: more, ...NEW_TAB }, " Read it on gnoweb"),
      )
    : undefined;
  return createElement("article", { className: styles["page"] }, ...drawn, below, notice, warning.dialog);
}

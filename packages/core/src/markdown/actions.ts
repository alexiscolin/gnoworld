// Tier 1 (docs/REVIEW.md). A realm page's links to its own functions as actions (slice 13, D13300): on the page of a realm, a link to
// that realm's `$help&func=` under gnoweb's origin, as gno's txlink writes it, is its call (core's helpCall), never an address; one
// that is no call shows its label alone. A pass over the page's tree, apart from its reader, which the chat's drawing and the first
// screens share: only the realm's view loads it.
import { helpCall } from "../args/help.ts";
import { originOf } from "./address.ts";
import { append } from "./nodes.ts";
import type { Outline } from "./outline.ts";
import type { PageBlock } from "./pageGrammar.ts";
import type { Inline } from "./types.ts";

/** The page's blocks, each link to `realm`'s own `$help&func=` under gnoweb's `origin` an action (an image's link left one); the same
 * blocks for an origin that is no https one or a realm with no path. Linear in the tree; the blocks given are not changed. */
export function withActions(
  blocks: readonly PageBlock[],
  { origin, realm }: { origin: string; realm: string },
): PageBlock[] {
  const base = originOf(origin);
  const slash = realm.indexOf("/");
  if (base === undefined || slash < 1) return [...blocks];
  const help = `${base}${realm.slice(slash)}$help`;
  // A node after the others, a text copied so that joining the next one changes no node of the blocks given.
  const add = (into: Inline[], node: Inline) => {
    append(into, node.type === "text" ? { ...node } : node);
  };
  // A node as the page's view draws it: a link to the realm's own `$help&func=` its call, or its label for one that is no call.
  const drawn = (node: Inline): Inline[] => {
    if (node.type !== "link") return ["children" in node ? { ...node, children: inlines(node.children) } : node];
    if (node.image === true || !node.href.startsWith(`${help}&func=`)) return [node];
    const call = helpCall(node.href.slice(help.length));
    return call === undefined
      ? node.children
      : [{ type: "action", func: call.func, args: call.args, children: node.children }];
  };
  const inlines = (nodes: readonly Inline[]): Inline[] => {
    const out: Inline[] = [];
    for (const node of nodes) for (const each of drawn(node)) add(out, each);
    return out;
  };
  // Each block that holds words, through `inlines`; one holding blocks, through itself; code, rules and forms as they are.
  const block = (b: PageBlock): PageBlock => {
    if (b.type === "paragraph" || b.type === "heading") return { ...b, children: inlines(b.children) };
    if (b.type === "list") return { ...b, items: b.items.map(inlines) };
    if (b.type === "table") return { ...b, head: b.head.map(inlines), rows: b.rows.map((row) => row.map(inlines)) };
    if (b.type === "quote") return { ...b, children: b.children.map(block) };
    if (b.type === "columns") return { ...b, columns: b.columns.map((column) => column.map(block)) };
    return b.type === "outline" ? outline(b, inlines) : b;
  };
  return blocks.map(block);
}

// An outline's items and the outlines under them, each item's words through `inlines`.
function outline(list: Outline, inlines: (nodes: readonly Inline[]) => Inline[]): Outline {
  const items = list.items.map((item) => ({
    ...item,
    children: inlines(item.children),
    sub: item.sub.map((sub) => outline(sub, inlines)),
  }));
  return { ...list, items };
}

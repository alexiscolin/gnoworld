// The nodes the line reader makes (slice 4's 4c): a mark's, whether a label's show anything, a label's mentions made
// text (4d), and a node added to those before it; and a walk of a message's tree, each inline node in order.
import type { Block, Inline } from "./types.ts";

/** The node a mark of `mark`, `size` long, makes of what it holds: three stars make two. */
export function wrap(mark: string, size: number, children: Inline[]): Inline {
  if (mark === "~") return { type: "strike", children };
  if (size === 1) return { type: "em", children };
  if (size === 2) return { type: "strong", children };
  return { type: "em", children: [{ type: "strong", children }] };
}

// What draws nothing: spaces, format characters, the code points a renderer ignores (Hangul fillers, joiners,
// variation selectors) and the braille blank (F781).
const BLANK = /^[\s\p{Cf}\p{Default_Ignorable_Code_Point}\u2800]*$/u;

// Whether nodes show nothing: texts and code that draw nothing, in marks or not. A link's label must show
// something, or its address is a link no one sees.
export function invisible(nodes: readonly Inline[]): boolean {
  return nodes.every((node) => {
    if (node.type === "text" || node.type === "code") return BLANK.test(node.text);
    return "children" in node && invisible(node.children);
  });
}

/** Nodes with each mention in them, however deep, made text again: `@` and the address. */
function unmentioned(nodes: readonly Inline[]): Inline[] {
  const plain: Inline[] = [];
  for (const node of nodes) {
    if (node.type === "mention") append(plain, { type: "text", text: `@${node.address}` });
    else append(plain, "children" in node ? { ...node, children: unmentioned(node.children) } : node);
  }
  return plain;
}

/** A link's label from what it holds: no account is named in it, its mentions are text again; an image with no alt text
 * names its address. */
export function labelOf(nodes: readonly Inline[], href: string, image: boolean): Inline[] {
  const named = unmentioned(nodes);
  return image && invisible(named) ? [{ type: "text", text: href }] : named;
}

/** A node after the last: a text joins the text before it, and an empty one adds nothing. */
export function append(nodes: Inline[], node: Inline): void {
  const last = nodes.at(-1);
  if (node.type === "text" && last?.type === "text") last.text += node.text;
  else if (node.type !== "text" || node.text !== "") nodes.push(node);
}

function* within(nodes: readonly Inline[]): Generator<Inline> {
  for (const node of nodes) {
    yield node;
    if ("children" in node) yield* within(node.children);
  }
}

/** Each inline node of a message's tree, in order: in paragraphs, quotes and list items, in marks and labels too. */
export function* inlines(blocks: readonly Block[]): Generator<Inline> {
  for (const block of blocks) {
    if (block.type === "quote") yield* inlines(block.children);
    else if (block.type === "list") for (const item of block.items) yield* within(item);
    else if (block.type === "paragraph") yield* within(block.children);
  }
}

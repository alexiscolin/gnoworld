// A message's text, read as Markdown (slice 4's 4c): core's tree, each node an element of the allowlist and every
// text React's text, so nothing from Ergo reaches HTML. A one-paragraph message stays on its line, in a span; other
// blocks go below it, in a div. A link opens its https address in a new tab, with no opener and no referrer, the
// whole address in its title, its label being anyone's words. A mention (4d) shows its account's address shortened,
// whole in its title; the reader's own apart; an address neither the reader's nor a member's whole (F812). Children go
// to createElement one by one: a tree that never changes needs no keys.
import { markdown, type Block, type Inline } from "@gnoworld/core";
import { createElement, type ReactNode } from "react";
import { NEW_TAB } from "../../lib/newTab.ts";
import { isAccount, shortAddress } from "./names.ts";

const MARKS = { strong: "strong", em: "em", strike: "s", underline: "u" } as const;
// A link isolates its text left to right: an override before it cannot draw its address backwards (F786).
export const LINK = { dir: "ltr", ...NEW_TAB } as const;

// Who reads: the reader's address, none for a guest, and the room's members; whether the links take the Tab key.
export interface Reader {
  me: string | undefined;
  members: ReadonlySet<string> | undefined;
  tabbable: boolean;
  /** Draws a link itself (a realm's page puts a warning before one that leaves gnoweb); none, or `undefined` from it, draws
   * the usual anchor. Its label is the link's own, already drawn. */
  link?: ((href: string, label: ReactNode[]) => ReactNode) | undefined;
}

/** A reader with no account, outside any room: every mention whole, every link a Tab stop. What a realm's page is drawn
 * for (features/realms), which shares this file's drawing of marks, paragraphs, code and lists. */
export const ANONYMOUS: Reader = { me: undefined, members: undefined, tabbable: true };

// A mention: its address whole in its title, the design system's look (data-mention), the reader's own "me";
// shortened for the reader and members alone, since a ground lookalike holds no key so joins no room (F812). An
// address whose checksum fails is no account's: whole, as text (F805).
function mentionOf(address: string, { me, members }: Reader): ReactNode {
  if (!isAccount(address)) return `@${address}`;
  const known = address === me || members?.has(address) === true;
  return createElement(
    "span",
    { "data-mention": address === me ? "me" : "", title: address },
    `@${known ? shortAddress(address) : address}`,
  );
}

// Nodes as elements, who reads carried down to the mentions.
export const drawInlines = (nodes: readonly Inline[], reader: Reader) => nodes.map((node) => inline(node, reader));
const drawBlocks = (nodes: readonly Block[], reader: Reader) => nodes.map((node) => block(node, reader));

// A link: the reader's own drawing of it, or the usual anchor.
function linkOf(node: Extract<Inline, { type: "link" }>, reader: Reader): ReactNode {
  const label = drawInlines(node.children, reader);
  return (
    reader.link?.(node.href, label) ??
    createElement(
      "a",
      { href: node.href, title: node.href, ...LINK, tabIndex: reader.tabbable ? undefined : -1 },
      ...label,
    )
  );
}

function inline(node: Inline, reader: Reader): ReactNode {
  switch (node.type) {
    case "text":
      return node.text;
    case "code":
      return createElement("code", null, node.text);
    case "break":
      return createElement("br");
    case "link":
      return linkOf(node, reader);
    case "mention":
      return mentionOf(node.address, reader);
    case "strong":
    case "em":
    case "strike":
    case "underline":
      return createElement(MARKS[node.type], null, ...drawInlines(node.children, reader));
  }
}

export function block(node: Block, reader: Reader): ReactNode {
  switch (node.type) {
    case "paragraph":
      return createElement("p", null, ...drawInlines(node.children, reader));
    case "codeBlock":
      return createElement("pre", null, createElement("code", null, node.text));
    case "quote":
      return createElement("blockquote", null, ...drawBlocks(node.children, reader));
    case "list":
      return createElement(
        node.ordered ? "ol" : "ul",
        node.ordered && node.start !== 1 ? { start: node.start } : null,
        ...node.items.map((item) => createElement("li", null, ...drawInlines(item, reader))),
      );
  }
}

export interface MarkdownProps {
  blocks: readonly Block[];
  className?: string | undefined;
  /** The reader's address, whose mentions show apart; none for a guest. */
  me?: string | undefined;
  /** The room's members, whose mentions show shortened as the reader's do; anyone else's whole (F812). */
  members?: ReadonlySet<string> | undefined;
  /** Whether its links are Tab stops: a line not the list's stop keeps them out (U1). */
  tabbable?: boolean;
}

/** A message's tree as elements: one paragraph on its line, in a span; other blocks below it, in a div. */
export function Markdown({ blocks, className, me, members, tabbable = true }: MarkdownProps) {
  const reader = { me, members, tabbable };
  const [first] = blocks;
  if (first === undefined) return createElement("span", { className });
  if (blocks.length === 1 && first.type === "paragraph") {
    return createElement("span", { className }, ...drawInlines(first.children, reader));
  }
  return createElement("div", { className }, ...drawBlocks(blocks, reader));
}

/** A message's text, its Markdown as elements. */
export function Message({ text, ...shown }: Omit<MarkdownProps, "blocks"> & { text: string }) {
  return <Markdown blocks={markdown(text)} {...shown} />;
}

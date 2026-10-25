// A message's text, read as Markdown (slice 4's 4c): core's tree, each node an element of the allowlist and every
// text React's text, so nothing from Ergo reaches HTML. A one-paragraph message stays on its line, in a span; other
// blocks go below it, in a div. A link opens its https address in a new tab, with no opener and no referrer, the
// whole address in its title, its label being anyone's words. A mention (4d) shows its account's address shortened,
// whole in its title; the reader's own apart. Children go to createElement one by one: a tree that never changes
// needs no keys.
import { markdown, type Block, type Inline } from "@gnoworld/core";
import { Address } from "@gnoworld/schemas";
import { createElement, type ReactNode } from "react";
import { shortAddress } from "./names.ts";

const MARKS = { strong: "strong", em: "em", strike: "s" } as const;
// A link isolates its text left to right: an override before it cannot draw its address backwards (F786).
const LINK = { dir: "ltr", target: "_blank", rel: "noopener noreferrer" } as const;

// A mention: the account's address shortened, whole in its title, its look the design system's base (data-mention),
// the reader's own "me". An address whose checksum fails is no account's: whole, as text, so no lookalike borrows
// an account's short form (F805).
function mentionOf(address: string, me: string | undefined): ReactNode {
  if (!Address.safeParse(address).success) return `@${address}`;
  return createElement(
    "span",
    { "data-mention": address === me ? "me" : "", title: address },
    `@${shortAddress(address)}`,
  );
}

// Nodes as elements, the reader's address carried down to the mentions.
const drawInlines = (nodes: readonly Inline[], me: string | undefined) => nodes.map((node) => inline(node, me));
const drawBlocks = (nodes: readonly Block[], me: string | undefined) => nodes.map((node) => block(node, me));

function inline(node: Inline, me: string | undefined): ReactNode {
  switch (node.type) {
    case "text":
      return node.text;
    case "code":
      return createElement("code", null, node.text);
    case "break":
      return createElement("br");
    case "link":
      return createElement("a", { href: node.href, title: node.href, ...LINK }, ...drawInlines(node.children, me));
    case "mention":
      return mentionOf(node.address, me);
    case "strong":
    case "em":
    case "strike":
      return createElement(MARKS[node.type], null, ...drawInlines(node.children, me));
  }
}

function block(node: Block, me: string | undefined): ReactNode {
  switch (node.type) {
    case "paragraph":
      return createElement("p", null, ...drawInlines(node.children, me));
    case "codeBlock":
      return createElement("pre", null, createElement("code", null, node.text));
    case "quote":
      return createElement("blockquote", null, ...drawBlocks(node.children, me));
    case "list":
      return createElement(
        node.ordered ? "ol" : "ul",
        node.ordered && node.start !== 1 ? { start: node.start } : null,
        ...node.items.map((item) => createElement("li", null, ...drawInlines(item, me))),
      );
  }
}

export interface MarkdownProps {
  blocks: readonly Block[];
  className?: string | undefined;
  /** The reader's address, whose mentions show apart; none for a guest. */
  me?: string | undefined;
}

/** A message's tree as elements: one paragraph on its line, in a span; other blocks below it, in a div. */
export function Markdown({ blocks, className, me }: MarkdownProps) {
  const [first] = blocks;
  if (first === undefined) return createElement("span", { className });
  if (blocks.length === 1 && first.type === "paragraph") {
    return createElement("span", { className }, ...drawInlines(first.children, me));
  }
  return createElement("div", { className }, ...drawBlocks(blocks, me));
}

/** A message's text, its Markdown as elements. */
export function Message({ text, ...shown }: Omit<MarkdownProps, "blocks"> & { text: string }) {
  return <Markdown blocks={markdown(text)} {...shown} />;
}

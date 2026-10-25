// A message's text, read as Markdown (slice 4's 4c): core's tree, each node an element of the allowlist and every
// text React's text, so nothing from Ergo reaches HTML. A one-paragraph message stays on its line, in a span; other
// blocks go below it, in a div. A link opens its https address in a new tab, with no opener and no referrer, the
// whole address in its title, its label being anyone's words. Children go to createElement one by one: a tree
// that never changes needs no keys.
import { markdown, type Block, type Inline } from "@gnoworld/core";
import { createElement, type ReactNode } from "react";

const MARKS = { strong: "strong", em: "em", strike: "s" } as const;
// A link isolates its text left to right: an override before it cannot draw its address backwards (F786).
const LINK = { dir: "ltr", target: "_blank", rel: "noopener noreferrer" } as const;

function inline(node: Inline): ReactNode {
  switch (node.type) {
    case "text":
      return node.text;
    case "code":
      return createElement("code", null, node.text);
    case "break":
      return createElement("br");
    case "link":
      return createElement("a", { href: node.href, title: node.href, ...LINK }, ...node.children.map(inline));
    case "strong":
    case "em":
    case "strike":
      return createElement(MARKS[node.type], null, ...node.children.map(inline));
  }
}

function block(node: Block): ReactNode {
  switch (node.type) {
    case "paragraph":
      return createElement("p", null, ...node.children.map(inline));
    case "codeBlock":
      return createElement("pre", null, createElement("code", null, node.text));
    case "quote":
      return createElement("blockquote", null, ...node.children.map(block));
    case "list":
      return createElement(
        node.ordered ? "ol" : "ul",
        node.ordered && node.start !== 1 ? { start: node.start } : null,
        ...node.items.map((item) => createElement("li", null, ...item.map(inline))),
      );
  }
}

/** A message's text, its Markdown as elements. */
export function Message({ text, className }: { text: string; className?: string | undefined }) {
  const blocks = markdown(text);
  const [first] = blocks;
  if (first === undefined) return createElement("span", { className });
  if (blocks.length === 1 && first.type === "paragraph") {
    return createElement("span", { className }, ...first.children.map(inline));
  }
  return createElement("div", { className }, ...blocks.map(block));
}

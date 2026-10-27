// A message's words in one line (slice 4's 4d): what a reply's quote and the composer's reply bar show of the line
// answered, read as the room reads it (markdown.ts), its marks gone, its parts joined by a space, so what the room
// shows as text stays text; and those words cut to a length, between two graphemes.
import { markdown } from "./markdown.ts";
import type { Block, Inline } from "./types.ts";

const words = (nodes: readonly Inline[]): string =>
  nodes
    .map((node) => {
      if (node.type === "text" || node.type === "code") return node.text;
      if (node.type === "mention") return `@${node.address}`;
      return node.type === "break" ? " " : words(node.children);
    })
    .join("");

function blockWords(block: Block): string {
  if (block.type === "paragraph") return words(block.children);
  if (block.type === "codeBlock") return block.text;
  if (block.type === "quote") return block.children.map(blockWords).join(" ");
  return block.items.map(words).join(" ");
}

/** A message's words in one line, its spaces collapsed. */
export const plain = (source: string): string => markdown(source).map(blockWords).join(" ").replace(/\s+/g, " ").trim();

/** A message's words cut to `length` graphemes, the last an ellipsis when cut: a skin tone, a ZWJ family or a flag
 * stays whole. */
export function excerpt(source: string, length: number): string {
  if (!Number.isInteger(length) || length < 2) throw new RangeError("excerpt: the length is a whole number, 2 or more");
  const text = plain(source);
  const graphemes = [...new Intl.Segmenter().segment(text)].map(({ segment }) => segment);
  return graphemes.length <= length ? text : `${graphemes.slice(0, length - 1).join("")}…`;
}

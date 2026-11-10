// The plate's sentence (D566): the first paragraph of the realm's own page, as plain words, cut to a line. A page that opens with
// anything but a paragraph (a heading, a form) before one gives the first paragraph after; none, no sentence.
import type { Inline, PageBlock } from "@gnoworld/core";

const LONGEST = 160;

const words = (inline: readonly Inline[]): string =>
  inline
    .map((each) => {
      if (each.type === "text" || each.type === "code") return each.text;
      if (each.type === "break") return " ";
      if (each.type === "mention") return "";
      return words(each.children);
    })
    .join("");

/** The first paragraph's words, one line of at most 160 characters, or none. */
export function sentenceOf(blocks: readonly PageBlock[]): string | undefined {
  for (const block of blocks) {
    if (block.type !== "paragraph") continue;
    const line = words(block.children).replace(/\s+/g, " ").trim();
    if (line === "") continue;
    return line.length > LONGEST ? `${line.slice(0, LONGEST - 1).trimEnd()}…` : line;
  }
  return undefined;
}

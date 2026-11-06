// Markdown, the chat's subset (ADR-0001 §3, slice 4's 4c): a message read into a tree of the nodes a renderer draws,
// never HTML. Within a line, marks at word bounds and links to https alone (inline.ts); of blocks, paragraphs,
// fenced code, quotes 4 deep at most and flat lists, none of them lazy (blocks.ts). No heading, image, HTML, rule,
// table or entity: what would be one stays text, as does a fence never closed and a quote holding nothing, so a
// message with something in it never reads as nothing. Linear in the message's length.
import { Blocks, CHAT } from "./blocks.ts";
import type { Block } from "./types.ts";

export { MAX_QUOTE_DEPTH } from "./blocks.ts";
export { MAX_INLINE_DEPTH } from "./inline.ts";
export { mentions, mentionsRoom } from "./mentions.ts";
export { inlines } from "./nodes.ts";
export { inWord } from "./scan.ts";
export type { Block, Inline } from "./types.ts";

/** A message, as its tree's blocks. */
export function markdown(source: string): Block[] {
  return new Blocks(source.split(/\r\n|\r|\n/), 0, CHAT).read();
}

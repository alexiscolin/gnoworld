// Markdown, the chat's subset (ADR-0001 §3, slice 4's 4c): a message read into a tree of the nodes a renderer draws,
// never HTML. Within a line, marks at word bounds and links to https alone (inline.ts); of blocks, paragraphs,
// fenced code, quotes 4 deep at most and flat lists, none of them lazy. No heading, image, HTML, rule, table or
// entity: what would be one stays text, as does a fence never closed and a quote holding nothing, so a message
// with something in it never reads as nothing. Linear in the message's length.
import { inline } from "./inline.ts";
import type { Block, Inline } from "./types.ts";

export { MAX_INLINE_DEPTH } from "./inline.ts";
export type { Block, Inline } from "./types.ts";

/** The quotes a quote nests, at most: past them, a `>` is text. */
export const MAX_QUOTE_DEPTH = 4;

// A fence: three backticks or more, then a language (dropped) that holds none.
const FENCE = /^(`{3,})[^`]*$/;
// A list's item: `-`, `*`, `+` or a number and a dot, then a space.
const ITEM = /^(?:[-*+]|(\d{1,9})\.) (.*)$/s;

// A block read from a line: the line after it, and the block, unless it held nothing.
interface Read {
  next: number;
  block?: Block;
}

/** A message, as its tree's blocks. */
export function markdown(source: string): Block[] {
  return new Blocks(source.split(/\r\n|\r|\n/), 0).read();
}

// How many backticks close a fence on this line: backticks alone, or none.
function closer(line: string): number {
  const body = line.trim();
  return /^`+$/.test(body) ? body.length : 0;
}

// For each line, the longest closer from it to the end: a fence longer than that never closes.
function closers(lines: readonly string[]): Int32Array {
  const longest = new Int32Array(lines.length + 1);
  for (let at = lines.length - 1; at >= 0; at -= 1) {
    longest[at] = Math.max(longest[at + 1] ?? 0, closer(lines[at] ?? ""));
  }
  return longest;
}

// Lines read into blocks; a quote's inside is read again one level deeper.
class Blocks {
  readonly #lines: readonly string[];
  readonly #depth: number;
  #closers: Int32Array | undefined;

  constructor(lines: readonly string[], depth: number) {
    this.#lines = lines;
    this.#depth = depth;
  }

  read(): Block[] {
    const read: Block[] = [];
    let at = 0;
    while (at < this.#lines.length) {
      const { next, block } = this.#block(at);
      if (block !== undefined) read.push(block);
      at = next;
    }
    return read;
  }

  #body(at: number): string {
    return (this.#lines[at] ?? "").trimStart();
  }

  // What a line starts: nothing, a fence, a quote, a list's item, or else a paragraph's text.
  #start(at: number): "blank" | "fence" | "quote" | "item" | "text" {
    const body = this.#body(at);
    if (body === "") return "blank";
    if (FENCE.test(body)) return "fence";
    if (this.#quoted(body)) return "quote";
    return ITEM.test(body) ? "item" : "text";
  }

  #block(at: number): Read {
    const start = this.#start(at);
    if (start === "blank") return { next: at + 1 };
    if (start === "quote") return this.#quote(at);
    if (start === "item") return this.#list(at);
    const code = start === "fence" ? this.#code(at) : undefined;
    return code ?? this.#paragraph(at, this.#paragraphEnd(at));
  }

  #quoted(body: string): boolean {
    return this.#depth < MAX_QUOTE_DEPTH && body.startsWith(">");
  }

  // Fenced code, to a line of backticks alone as many as the fence's or more; none if no such line comes.
  #code(at: number): Read | undefined {
    const size = FENCE.exec(this.#body(at))?.[1]?.length ?? 0;
    this.#closers ??= closers(this.#lines);
    if ((this.#closers[at + 1] ?? 0) < size) return undefined;
    let end = at + 1;
    while (closer(this.#lines[end] ?? "") < size) end += 1;
    return { next: end + 1, block: { type: "codeBlock", text: this.#lines.slice(at + 1, end).join("\n") } };
  }

  // A quote's lines, each led by `>`, read again one level in; a line that is not ends it. Holding nothing, its
  // lines are a paragraph of their marks.
  #quote(at: number): Read {
    const inner: string[] = [];
    let end = at;
    for (; end < this.#lines.length; end += 1) {
      const body = this.#body(end);
      if (!this.#quoted(body)) break;
      inner.push(body.slice(1).replace(/^ /, ""));
    }
    const children = new Blocks(inner, this.#depth + 1).read();
    return children.length === 0 ? this.#paragraph(at, end) : { next: end, block: { type: "quote", children } };
  }

  // A list's items, one a line, each led by a mark of the first one's kind; a line that is not ends it.
  #list(at: number): Read {
    const ordered = ITEM.exec(this.#body(at))?.[1] !== undefined;
    const items: Inline[][] = [];
    let end = at;
    for (; end < this.#lines.length; end += 1) {
      const item = ITEM.exec(this.#body(end));
      if (item === null || (item[1] !== undefined) !== ordered) break;
      items.push(inline((item[2] ?? "").trim()));
    }
    return { next: end, block: { type: "list", ordered, items } };
  }

  // Where a paragraph from `at` ends: at a blank line or a block's start.
  #paragraphEnd(at: number): number {
    let end = at + 1;
    while (end < this.#lines.length && this.#start(end) === "text") end += 1;
    return end;
  }

  // A paragraph's lines from `at` to `end`, each line's marks read apart, a break between two.
  #paragraph(at: number, end: number): Read {
    const children: Inline[] = [];
    for (const [n, line] of this.#lines.slice(at, end).entries()) {
      if (n > 0) children.push({ type: "break" });
      for (const node of inline(line.trim())) children.push(node);
    }
    return { next: end, block: { type: "paragraph", children } };
  }
}

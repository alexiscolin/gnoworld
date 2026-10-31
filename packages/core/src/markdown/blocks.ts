// The block reader (slice 4's 4c), shared by the chat and a realm's page (5h): lines read into blocks, a quote's inside
// read again one level deeper. A dialect (`Grammar`) adds what only a page knows: the blocks of its own, the head of an
// alert, a line's marks; the chat's has none, so the chat's page of rules is unchanged. Linear in the lines.
import { inline } from "./inline.ts";
import type { Inline, Tree } from "./types.ts";

/** The quotes a quote nests, at most: past them, a `>` is text. */
export const MAX_QUOTE_DEPTH = 4;

// A fence: three backticks or more, then a language (dropped) that holds none.
const FENCE = /^(`{3,})[^`]*$/;
// A list's item: `-`, `*`, `+` or a number and a dot, then a space.
const ITEM = /^(?:[-*+]|(\d{1,9})\.) (.*)$/s;

// A list's item, its number if any and its text; none for an item with nothing in it, which stays text, as an empty
// quote does (F782).
function itemOf(body: string): { number: string | undefined; text: string } | undefined {
  const item = ITEM.exec(body);
  const text = (item?.[2] ?? "").trim();
  return item === null || text === "" ? undefined : { number: item[1], text };
}

/** A block read from a line: the line after it, and the block, unless it held nothing. */
export interface Read<Extra> {
  next: number;
  block?: Tree<Extra>;
}

/** What a dialect knows of the lines being read. */
export interface Grammar<Extra> {
  /** A line's marks. */
  inline(line: string): Inline[];
  /** The block of its own that the line at `at` starts, as the reading of it, or none: it ends a paragraph before it. */
  extra?(at: number): (() => Read<Extra>) | undefined;
  /** Whether a fence's language, what follows its backticks, may stay unseen: a line whose is not is text. */
  fence?(language: string): boolean;
  /** A quote's head, if its inside has one (an alert's title): that block, and the lines after the head. */
  head?(inner: readonly string[]): { block: Tree<Extra>; rest: string[] } | undefined;
}

/** A dialect: for the lines to read, their grammar. A quote's lines are read with the same dialect, one level in. */
export type Dialect<Extra> = (lines: readonly string[]) => Grammar<Extra>;

/** The chat's: marks, and nothing else. */
export const CHAT: Dialect<never> = () => ({ inline });

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

/** Lines read into blocks; a quote's inside is read again one level deeper. */
export class Blocks<Extra> {
  readonly #lines: readonly string[];
  readonly #depth: number;
  readonly #dialect: Dialect<Extra>;
  readonly #grammar: Grammar<Extra>;
  #closers: Int32Array | undefined;

  constructor(lines: readonly string[], depth: number, dialect: Dialect<Extra>) {
    this.#lines = lines;
    this.#depth = depth;
    this.#dialect = dialect;
    this.#grammar = dialect(lines);
  }

  read(): Tree<Extra>[] {
    const read: Tree<Extra>[] = [];
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

  // What a line starts: nothing, a fence, a quote, a block of the dialect's, a list's item, or else a paragraph's text.
  #start(at: number): "blank" | "fence" | "quote" | "extra" | "item" | "text" {
    const body = this.#body(at);
    if (body === "") return "blank";
    if (this.#fenced(body)) return "fence";
    if (this.#quoted(body)) return "quote";
    if (this.#grammar.extra?.(at) !== undefined) return "extra";
    return itemOf(body) === undefined ? "text" : "item";
  }

  #block(at: number): Read<Extra> {
    const start = this.#start(at);
    if (start === "blank") return { next: at + 1 };
    if (start === "quote") return this.#quote(at);
    if (start === "item") return this.#list(at);
    if (start === "extra") return this.#grammar.extra?.(at)?.() ?? { next: at + 1 };
    const code = start === "fence" ? this.#code(at) : undefined;
    return code ?? this.#paragraph(at, this.#paragraphEnd(at));
  }

  #fenced(body: string): boolean {
    const fence = FENCE.exec(body);
    return fence !== null && this.#grammar.fence?.(body.slice((fence[1] ?? "").length)) !== false;
  }

  #quoted(body: string): boolean {
    return this.#depth < MAX_QUOTE_DEPTH && body.startsWith(">");
  }

  // Fenced code, to a line of backticks alone as many as the fence's or more; none if no such line comes.
  #code(at: number): Read<Extra> | undefined {
    const size = FENCE.exec(this.#body(at))?.[1]?.length ?? 0;
    this.#closers ??= closers(this.#lines);
    if ((this.#closers[at + 1] ?? 0) < size) return undefined;
    let end = at + 1;
    while (closer(this.#lines[end] ?? "") < size) end += 1;
    return { next: end + 1, block: { type: "codeBlock", text: this.#lines.slice(at + 1, end).join("\n") } };
  }

  // A quote's lines, each led by `>`, read again one level in; a line that is not ends it. Holding nothing, its
  // lines are a paragraph of their marks.
  #quote(at: number): Read<Extra> {
    const inner: string[] = [];
    let end = at;
    for (; end < this.#lines.length; end += 1) {
      const body = this.#body(end);
      if (!this.#quoted(body)) break;
      inner.push(body.slice(1).replace(/^ /, ""));
    }
    const head = this.#grammar.head?.(inner);
    const children = new Blocks(head?.rest ?? inner, this.#depth + 1, this.#dialect).read();
    if (head !== undefined) children.unshift(head.block);
    return children.length === 0 ? this.#paragraph(at, end) : { next: end, block: { type: "quote", children } };
  }

  // A list's items, one a line, each led by a mark of the first one's kind (a bullet, any of three, or a number); a
  // line that is not ends it.
  #list(at: number): Read<Extra> {
    // An ordered list counts from its first number, the sender's own (F780).
    const first = itemOf(this.#body(at))?.number;
    const ordered = first !== undefined;
    const items: Inline[][] = [];
    let end = at;
    for (; end < this.#lines.length; end += 1) {
      const item = itemOf(this.#body(end));
      if (item === undefined || (item.number !== undefined) !== ordered) break;
      items.push(this.#grammar.inline(item.text));
    }
    const block: Tree<Extra> =
      first === undefined
        ? { type: "list", ordered: false, items }
        : { type: "list", ordered: true, start: Number(first), items };
    return { next: end, block };
  }

  // Where a paragraph from `at` ends: at a blank line or a block's start.
  #paragraphEnd(at: number): number {
    let end = at + 1;
    while (end < this.#lines.length && this.#start(end) === "text") end += 1;
    return end;
  }

  // A paragraph's lines from `at` to `end`, each line's marks read apart, a break between two.
  #paragraph(at: number, end: number): Read<Extra> {
    const children: Inline[] = [];
    for (const [n, line] of this.#lines.slice(at, end).entries()) {
      if (n > 0) children.push({ type: "break" });
      for (const node of this.#grammar.inline(line.trim())) children.push(node);
    }
    return { next: end, block: { type: "paragraph", children } };
  }
}

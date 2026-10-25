// A line's marks (slice 4's 4c), read left to right once: escapes, code, bare https addresses, links
// `[label](https://…)`, mentions `@g1…` (4d), and runs of one, two or three `*` or `_`, or two `~`, at word bounds.
// A mark or label open is a frame on a stack, holding what it would wrap; one never closed gives its run back as
// text. Marks and labels nest 8 deep at most, past which a mark is text: a hostile line costs no deeper stack and
// linear time.
import { Addresses } from "./address.ts";
import { mentionAt } from "./mentions.ts";
import { append, invisible, unmentioned, wrap } from "./nodes.ts";
import { after, before, Runs, runOf } from "./scan.ts";
import type { Inline } from "./types.ts";

/** The marks and labels a line nests, one in another, at most. */
export const MAX_INLINE_DEPTH = 8;

const SPACE = /\s/u;
const PUNCTUATION = /[\p{P}\p{S}]/u;
// What a backslash makes text: ASCII punctuation.
const ESCAPABLE = /[!-/:-@[-`{-~]/;

// A mark opens before a word (no space after it; a space, punctuation or the line's start before it) and closes
// after one, the other way round: none inside a word, as snake_case and 2*3*4 write.
const bound = (char: string | undefined) => char === undefined || SPACE.test(char) || PUNCTUATION.test(char);
/** Whether a character is part of a word, as the reader bounds marks: no space, punctuation or symbol. */
export const inWord = (char: string | undefined): boolean => !bound(char);
const opens = (behind: string | undefined, ahead: string | undefined) =>
  ahead !== undefined && !SPACE.test(ahead) && bound(behind);
const closes = (behind: string | undefined, ahead: string | undefined) =>
  behind !== undefined && !SPACE.test(behind) && bound(ahead);
// The nodes a run of `size` makes: three stars make two.
const weight = (size: number) => (size === 3 ? 2 : 1);

// A mark or label open: its character, how much of its run is open (its text, that character so many times), what
// it holds so far, and, for a label, whether it may still be a link (not once a link closed inside it).
interface Frame {
  readonly mark: string;
  size: number;
  children: Inline[];
  active: boolean;
}

class Reader {
  readonly #source: string;
  readonly #addresses: Addresses;
  // Where the reader stops to look: an escape, a mark, a label's bracket or an address.
  readonly #special = /[\\`*_~[\]@]|https:\/\//g;
  readonly #root: Inline[] = [];
  readonly #frames: Frame[] = [];
  #runs: Runs | undefined;
  #at = 0;

  constructor(source: string) {
    this.#source = source;
    this.#addresses = new Addresses(source);
  }

  read(): Inline[] {
    const length = this.#source.length;
    while (this.#at < length) {
      this.#special.lastIndex = this.#at;
      const next = this.#special.exec(this.#source)?.index ?? length;
      this.#add(this.#source.slice(this.#at, next));
      this.#at = next;
      if (next < length) this.#step();
    }
    this.#dropAbove(undefined);
    return this.#root;
  }

  #step(): void {
    const char = this.#source.charAt(this.#at);
    if (char === "\\") this.#escape();
    else if (char === "`") this.#code();
    else if (char === "[") this.#bracket();
    else if (char === "]") this.#close();
    else if (char === "h") this.#bare();
    else if (char === "@") this.#mention();
    else this.#mark(char);
  }

  // A backslash before ASCII punctuation makes it text; before anything else, it is text itself.
  #escape(): void {
    const next = this.#source.charAt(this.#at + 1);
    const escaped = next !== "" && ESCAPABLE.test(next);
    this.#add(escaped ? next : "\\");
    this.#at += escaped ? 2 : 1;
  }

  // A run of backticks to the next run of its length: code, unless blank; else the run is text.
  #code(): void {
    const at = this.#at;
    const size = runOf(this.#source, at, "`");
    this.#runs ??= new Runs(this.#source);
    const close = this.#runs.after(size, at + size);
    const code = close === undefined ? undefined : this.#source.slice(at + size, close);
    if (close !== undefined && code?.trim()) {
      this.#push({ type: "code", text: code });
      this.#at = close + size;
    } else {
      this.#add("`".repeat(size));
      this.#at = at + size;
    }
  }

  #bracket(): void {
    this.#at += 1;
    if (!this.#open("[", 1)) this.#add("[");
  }

  // `]`: a link, if a label is open and `(`, an https address and `)` follow; else text, its label's `[` too.
  #close(): void {
    const at = this.#at;
    this.#at += 1;
    const label = this.#frames.findLast((frame) => frame.mark === "[");
    if (label === undefined) {
      this.#add("]");
      return;
    }
    const end = label.active ? this.#addresses.destination(at + 1) : -1;
    if (end === -1 || (this.#frames.at(-1) === label && invisible(label.children))) {
      this.#splice(label);
      this.#add("]");
      return;
    }
    this.#dropAbove(label);
    this.#frames.pop();
    // A link's label names no account: its mentions are text again.
    this.#push({ type: "link", href: this.#source.slice(at + 2, end), children: unmentioned(label.children) });
    // No link inside a link: the labels around this one stay text.
    for (const frame of this.#frames) frame.active &&= frame.mark !== "[";
    this.#at = end + 1;
  }

  // An https address at a word's start, outside a label: a link to itself; else the letter.
  #bare(): void {
    const at = this.#at;
    const end = this.#inLabel() ? -1 : this.#addresses.bare(at);
    if (end === -1) {
      this.#add("h");
      this.#at = at + 1;
      return;
    }
    const href = this.#source.slice(at, end);
    this.#push({ type: "link", href, children: [{ type: "text", text: href }] });
    this.#at = end;
  }

  // `@` and an account's address: a mention (text again if a link's label closes around it); else the `@`.
  #mention(): void {
    const address = mentionAt(this.#source, this.#at);
    if (address === undefined) this.#add("@");
    else this.#push({ type: "mention", address });
    this.#at += 1 + (address?.length ?? 0);
  }

  // Whether a label is open: what a label holds is its words, no address of its own.
  #inLabel(): boolean {
    return this.#frames.some((frame) => frame.mark === "[");
  }

  // A run of `*`, `_` or `~`: it closes what it can, else opens, else is text.
  #mark(mark: string): void {
    const at = this.#at;
    const size = runOf(this.#source, at, mark);
    const behind = before(this.#source, at);
    const ahead = after(this.#source, at + size);
    this.#at = at + size;
    if (mark === "~" ? size !== 2 : size > 3) {
      this.#add(mark.repeat(size));
      return;
    }
    const left = closes(behind, ahead) ? this.#closeRun(mark, size) : size;
    if (left === size && opens(behind, ahead) && this.#open(mark, size)) return;
    this.#add(mark.repeat(left));
  }

  // A closing run: the nearest marks it fits close, innermost first; it gives back what it did not use.
  #closeRun(mark: string, size: number): number {
    let left = size;
    while (left > 0) {
      const frame = this.#find(mark, left);
      if (frame === undefined) break;
      left -= this.#closeAt(frame, left);
    }
    return left;
  }

  // The nearest open mark a closing run of `size` fits (the same length, or three stars split), never past a label.
  #find(mark: string, size: number): Frame | undefined {
    const fits = (frame: Frame) => frame.mark === mark && (frame.size === size || frame.size === 3 || size === 3);
    const found = this.#frames.findLast((frame) => frame.mark === "[" || fits(frame));
    return found?.mark === "[" ? undefined : found;
  }

  // The mark `frame` closes with `size` of its run, those above it text again; of three stars, what stays open wraps
  // what closed.
  #closeAt(frame: Frame, size: number): number {
    this.#dropAbove(frame);
    const used = Math.min(frame.size, size);
    const node = wrap(frame.mark, used, frame.children);
    frame.size -= used;
    if (frame.size === 0) {
      this.#frames.pop();
      this.#push(node);
    } else {
      frame.children = [node];
    }
    return used;
  }

  #open(mark: string, size: number): boolean {
    if (this.#depth() + weight(size) > MAX_INLINE_DEPTH) return false;
    this.#frames.push({ mark, size, children: [], active: true });
    return true;
  }

  // How deep the open marks and labels nest: what they would make, 8 frames at most to count.
  #depth(): number {
    return this.#frames.reduce((depth, frame) => depth + weight(frame.size), 0);
  }

  // Each mark open above `frame` (all of them, for none) gives its run back as text.
  #dropAbove(frame: Frame | undefined): void {
    for (let top = this.#frames.at(-1); top !== undefined && top !== frame; top = this.#frames.at(-1))
      this.#splice(top);
  }

  // The mark `frame` will not close: its run is text again, what it holds goes to the frame below, and those above
  // it stay open.
  #splice(frame: Frame): void {
    const index = this.#frames.indexOf(frame);
    this.#frames.splice(index, 1);
    const into = this.#frames[index - 1]?.children ?? this.#root;
    append(into, { type: "text", text: frame.mark.repeat(frame.size) });
    for (const child of frame.children) append(into, child);
  }

  #push(node: Inline): void {
    append(this.#frames.at(-1)?.children ?? this.#root, node);
  }

  #add(text: string): void {
    this.#push({ type: "text", text });
  }
}

/** A line's marks, as the tree's inline nodes. */
export function inline(line: string): Inline[] {
  return new Reader(line).read();
}

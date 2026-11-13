// A realm page's lists that the chat's flat list cannot hold (GFM's): an item with a list under it, a task (`[ ]`, `[x]`),
// or lines that continue it. An item's list is the lines indented past its mark; a line less indented ends it. A list nests
// 6 deep at most, past which an item stays on the last level; one pass over the lines, each read once.
import { OTHER_BLOCK } from "./tables.ts";
import { isRule } from "./rules.ts";
import type { Inline } from "./types.ts";

/** The lists a list nests, one in another, at most. */
export const MAX_LIST_DEPTH = 6;

export interface OutlineItem {
  children: Inline[];
  task: "none" | "open" | "done";
  sub: Outline[];
}

export interface Outline {
  type: "outline";
  ordered: boolean;
  start: number;
  items: OutlineItem[];
}

// A line's blanks, a mark (`-`, `*`, `+`, or a number and a dot), a space, then the text.
const ITEM = /^([ \t]*)(?:[-*+]|(\d{1,9})\.) (.*)$/;
const TASK = /^\[([ xX])\][ \t]+(\S.*)$/;

interface Line {
  indent: number;
  /** Where the item's own text starts: what a line must be indented to be under it. */
  offset: number;
  number: string | undefined;
  text: string;
}

function widthOf(blanks: string): number {
  let width = 0;
  for (const blank of blanks) width += blank === "\t" ? 4 : 1;
  return width;
}

// A line as an item, or none: not an item, a rule (`* * *`), or an item with nothing in it.
function itemOf(line: string): Line | undefined {
  const item = ITEM.exec(line);
  const text = (item?.[3] ?? "").trim();
  if (item === null || text === "" || isRule(line)) return undefined;
  const indent = widthOf(item[1] ?? "");
  return { indent, offset: indent + (item[2] === undefined ? 2 : item[2].length + 2), number: item[2], text };
}

/** What reading the list at a line made: it, where it ends, and whether it is more than the chat's flat list. */
export interface Listed {
  list: Outline;
  next: number;
  rich: boolean;
}

// What the item's text says of a task: its box and the words after it, or none.
function taskOf(text: string): { task: OutlineItem["task"]; text: string } {
  const task = TASK.exec(text);
  return task === null ? { task: "none", text } : { task: task[1] === " " ? "open" : "done", text: task[2] ?? "" };
}

// Whether `line` is an item that opens a list under `owner`, one the depth cap allows.
const nests = (line: Line, owner: Line, depth: number): boolean =>
  line.indent >= owner.offset && depth + 1 < MAX_LIST_DEPTH;

// Whether `line`, no item, continues `owner`: indented under it, and no block's start.
function continues(line: string, owner: Line): boolean {
  const body = line.trim();
  const indent = widthOf(/^[ \t]*/.exec(line)?.[0] ?? "");
  return indent >= owner.offset && body !== "" && !isRule(body) && !OTHER_BLOCK.test(body);
}

// Whether `item` is of the list that `first` opens: the same kind, and indented at least `floor`.
const sibling = (item: Line, first: Line, floor: number): boolean =>
  item !== NONE && (item.number === undefined) === (first.number === undefined) && item.indent >= floor;

const NONE: Line = { indent: -1, offset: -1, number: undefined, text: "" };

/** Where a list sits: how deep, and the indent below which an item is of the list around (none at the page's level). */
interface Place {
  depth: number;
  floor: number;
}

class Lists {
  readonly #lines: readonly string[];
  readonly #inline: (text: string) => Inline[];
  rich = false;

  constructor(lines: readonly string[], inline: (text: string) => Inline[]) {
    this.#lines = lines;
    this.#inline = inline;
  }

  // The list whose first item is `first`, at `at`, to the first line that is none of its own.
  list(first: Line, at: number, place: Place): { list: Outline; next: number } {
    const items: OutlineItem[] = [];
    let next = at;
    for (let item = first; sibling(item, first, place.floor); item = itemOf(this.#lines[next] ?? "") ?? NONE) {
      const read = this.#item(next, item, place.depth);
      items.push(read.item);
      next = read.next;
    }
    const start = first.number === undefined ? 1 : Number(first.number);
    return { list: { type: "outline", ordered: first.number !== undefined, start, items }, next };
  }

  // An item and what is under it: lists, or lines that continue it (none once a list is); the line after.
  #item(at: number, item: Line, depth: number): { item: OutlineItem; next: number } {
    const { task, text } = taskOf(item.text);
    const children = this.#inline(text);
    const sub: Outline[] = [];
    let next = at + 1;
    for (;;) {
      const line = this.#lines[next] ?? "";
      const under = itemOf(line);
      if (under !== undefined && nests(under, item, depth)) {
        const read = this.list(under, next, { depth: depth + 1, floor: item.offset });
        sub.push(read.list);
        next = read.next;
      } else if (under === undefined && sub.length === 0 && continues(line, item)) {
        children.push({ type: "break" });
        pushEach(children, this.#inline(line.trim()));
        this.rich = true;
        next += 1;
      } else break;
    }
    this.rich ||= task !== "none" || sub.length > 0;
    return { item: { children, task, sub }, next };
  }
}

// One push a node: a line of 60,000 code spans spread into one call passes the engine's count of arguments.
function pushEach<T>(into: T[], nodes: readonly T[]): void {
  for (const node of nodes) into.push(node);
}

/** The list that starts at `at`, if a line is an item there. */
export function listAt(lines: readonly string[], at: number, inline: (text: string) => Inline[]): Listed | undefined {
  const first = itemOf(lines[at] ?? "");
  if (first === undefined) return undefined;
  const lists = new Lists(lines, inline);
  const { list, next } = lists.list(first, at, { depth: 0, floor: -1 });
  return { list, next, rich: lists.rich };
}

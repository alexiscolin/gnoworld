// A realm page's tables (GFM's): a header row, a delimiter row of as many cells, then rows to a blank line or another
// block's start. Cells are read as marks, never as HTML; the caps keep a hostile table small. Every pass is linear.
import type { Read } from "./blocks.ts";
import { isRule } from "./rules.ts";
import type { Inline } from "./types.ts";

/** The most columns and body rows of a table that are read; past them a table is cut and says so (`cut`). */
export const MAX_TABLE_COLUMNS = 64;
export const MAX_TABLE_ROWS = 2000;

/** A column's alignment, as its delimiter cell writes it (`:--`, `--:`, `:-:`). */
export type Align = "left" | "right" | "center" | "none";

export interface Table {
  type: "table";
  align: Align[];
  head: Inline[][];
  rows: Inline[][][];
  cut: boolean;
}

// A line that opens another block: it ends a table's rows and cannot head one.
export const OTHER_BLOCK = /^(?:#{1,6} |>|```|<\/?gno-|(?:[-*+]|\d{1,9}\.) )/i;
const DELIMITER = /^:?-+:?$/;

// A row's cells, split at the pipes no backslash escapes, an outer pipe on either side no cell; `count` of them all, the
// first `keep` as text. One pass.
function split(line: string, keep: number): { cells: string[]; count: number } {
  const body = line.trim();
  const cells: string[] = [];
  let count = 0;
  let start = body.startsWith("|") ? 1 : 0;
  let last = -1;
  const push = (end: number) => {
    count += 1;
    if (cells.length < keep) cells.push(body.slice(start, end).trim().replaceAll("\\|", "|"));
  };
  for (let at = start; at < body.length; at += 1) {
    if (body[at] === "\\") at += 1;
    else if (body[at] === "|") {
      push(at);
      start = at + 1;
      last = at;
    }
  }
  if (last !== body.length - 1 || start === 0) push(body.length);
  return { cells, count };
}

// The alignments a delimiter row says, or none if any cell of it is not hyphens between optional colons.
function alignments(line: string): Align[] | undefined {
  const { cells } = split(line, Infinity);
  if (!cells.every((cell) => DELIMITER.test(cell))) return undefined;
  return cells.map((cell) => {
    const left = cell.startsWith(":");
    const right = cell.endsWith(":");
    return left && right ? "center" : right ? "right" : left ? "left" : "none";
  });
}

/** The reading of the table that the header row at `at` starts, or none: not a header, or no delimiter row of its width
 * under it. A row keeps the cells it has, cut to the header's width, never padded: a page of wide tables of short rows stays as small
 * as its bytes (the renderer pads). */
export function tableAt(
  lines: readonly string[],
  at: number,
  inline: (text: string) => Inline[],
): (() => Read<Table>) | undefined {
  const body = (lines[at] ?? "").trim();
  const delimiter = lines[at + 1] ?? "";
  if (!body.includes("|") || !delimiter.includes("|") || !delimiter.includes("-") || OTHER_BLOCK.test(body)) {
    return undefined;
  }
  const align = alignments(delimiter);
  const head = split(body, MAX_TABLE_COLUMNS);
  if (align?.length !== head.count) return undefined;
  const width = head.cells.length;
  return () => {
    const rows: Inline[][][] = [];
    let cut = head.count > MAX_TABLE_COLUMNS;
    let end = at + 2;
    for (; end < lines.length; end += 1) {
      const row = (lines[end] ?? "").trim();
      if (row === "" || OTHER_BLOCK.test(row) || isRule(row)) break;
      if (rows.length === MAX_TABLE_ROWS) cut = true;
      else {
        rows.push(split(row, width).cells.map(inline));
      }
    }
    const block: Table = { type: "table", align: align.slice(0, width), head: head.cells.map(inline), rows, cut };
    return { next: end, block };
  };
}

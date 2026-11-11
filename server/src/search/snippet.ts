// A hit's text for the page (slice 13, B2): the line cut to 240 characters around the first word found, and the words' ranges as
// offsets into that text. Plain text: the page draws it, the server never builds HTML (plan T5). Offsets are UTF-16 units.
import { SEARCH_SNIPPET } from "@gnoworld/schemas";
import { prefixed, wordsOf } from "./query.ts";

const WORDY = /[\p{L}\p{N}\p{M}]/u;
// What the index sees of a character: no accent, lower case (unicode61 remove_diacritics 2).
const fold = (char: string): string => char.normalize("NFD").replaceAll(/\p{M}/gu, "").toLowerCase();
const LEAD = 60;

interface Point {
  char: string;
  unit: number;
  folded: number;
}

// Per code point: where it starts in the text's UTF-16 units and in the text as the index folds it.
function pointsOf(text: string): { points: Point[]; folded: string } {
  const points = Array.from(text).map((char) => ({ char, unit: 0, folded: 0 }));
  let folded = "";
  let unit = 0;
  for (const point of points) {
    [point.unit, point.folded] = [unit, folded.length];
    unit += point.char.length;
    folded += fold(point.char);
  }
  return { points, folded };
}

const tokenEnd = (points: readonly Point[], at: number): number => {
  let end = at;
  while (WORDY.test(points[end]?.char ?? "")) end += 1;
  return end;
};

// Where the folded text stands at a point; a word too short to be a prefix names a whole token, so it ends where the token does.
const foldedLength = (points: readonly Point[], end: number, folded: string): number =>
  points[end]?.folded ?? folded.length;

// The tokens that start with the folded word (two words naming one token give equal ranges, so they sort by start alone): from its first character to its token's end, in the text's offsets.
function tokensOf({ points, folded }: ReturnType<typeof pointsOf>, text: string, word: string): [number, number][] {
  const marks: [number, number][] = [];
  for (const [at, point] of points.entries()) {
    if (WORDY.test(points[at - 1]?.char ?? "") || !folded.startsWith(word, point.folded)) continue;
    const end = tokenEnd(points, at);
    if (!prefixed(word) && foldedLength(points, end, folded) - point.folded !== word.length) continue;
    marks.push([point.unit, points[end]?.unit ?? text.length]);
  }
  return marks;
}

/** The ranges of the tokens that start with a typed word, in the text's own offsets, sorted, not overlapping. */
function found(text: string, words: readonly string[]): [number, number][] {
  const folded = pointsOf(text);
  const all = words.flatMap((typed) => tokensOf(folded, text, Array.from(typed).map(fold).join("")));
  const merged: [number, number][] = [];
  for (const mark of all.toSorted((a, b) => a[0] - b[0])) {
    if (mark[0] >= (merged.at(-1)?.[1] ?? 0)) merged.push(mark);
  }
  return merged;
}

export function snippetOf(text: string, q: string): { text: string; marks: [number, number][] } {
  const all = found(text, wordsOf(q));
  let start = 0;
  let end = text.length;
  const first = all[0];
  if (text.length > SEARCH_SNIPPET) {
    start = Math.min(Math.max(0, (first?.[0] ?? 0) - LEAD), text.length - SEARCH_SNIPPET);
    end = start + SEARCH_SNIPPET;
    // Never in the middle of a surrogate pair.
    if (/[\udc00-\udfff]/.test(text[start] ?? "")) start += 1;
    if (/[\ud800-\udbff]/.test(text[end - 1] ?? "")) end -= 1;
  }
  const marks = all.filter(([, to]) => to <= end).map(([from, to]): [number, number] => [from - start, to - start]);
  return { text: text.slice(start, end), marks };
}

// How a query reads and how well a text answers it: a mark's mode, then the whole, the start, a part, the letters in order, a few letters off.
import { isAddress } from "@gnoworld/core";

export interface Parsed {
  mode: "name" | "room" | "namespace" | "realm" | "command" | "address";
  text: string;
}

const MARKS: readonly [string, Parsed["mode"]][] = [
  ["#", "room"],
  ["@", "namespace"],
  ["/r/", "realm"],
  [">", "command"],
];

/** What a query says: its mark, and the words after it; an address is no mark, and no page holds one yet. */
export function parseQuery(raw: string): Parsed {
  const query = raw.trim().toLowerCase();
  const mark = MARKS.find(([prefix]) => query.startsWith(prefix));
  if (mark !== undefined) return { mode: mark[1], text: query.slice(mark[0].length).trim() };
  return { mode: isAddress(query) ? "address" : "name", text: query };
}

const WORD_START = /[\s.\-/@#_]/;
const at = (row: readonly number[], index: number) => row[index] ?? 0;

// Optimal string alignment: the edits, a swap of two letters one, between two words.
function distance(a: string, b: string): number {
  let before: number[] = [];
  let prev = Array.from({ length: b.length + 1 }, (_, j) => j);
  for (let i = 1; i <= a.length; i++) {
    const row = [i];
    for (let j = 1; j <= b.length; j++) {
      const cost = a[i - 1] === b[j - 1] ? 0 : 1;
      const swapped = a[i - 1] === b[j - 2] && a[i - 2] === b[j - 1] ? at(before, j - 2) + 1 : Infinity;
      row.push(Math.min(at(prev, j) + 1, at(row, j - 1) + 1, at(prev, j - 1) + cost, swapped));
    }
    before = prev;
    prev = row;
  }
  return at(prev, b.length);
}

function inOrder(text: string, query: string): number[] | undefined {
  const hits: number[] = [];
  for (let n = 0; n < text.length && hits.length < query.length; n++) if (text[n] === query[hits.length]) hits.push(n);
  return hits.length === query.length ? hits : undefined;
}

// How many letters off a query may be: a short word is a word.
const slack = (length: number) => (length < 4 ? 0 : length < 8 ? 1 : 2);

// The fewest edits between the query and the whole text when it is as long, or a word of it, or the start of a longer word.
function fewestEdits(
  { lower: t, words }: { lower: string; words: readonly string[] },
  q: string,
  allowed: number,
): number {
  let best = Math.abs(t.length - q.length) <= allowed ? distance(t, q) : allowed + 1;
  for (const word of words) {
    const near = Math.abs(word.length - q.length) <= allowed;
    if (near) best = Math.min(best, distance(word, q));
    else if (word.length > q.length) best = Math.min(best, distance(word.slice(0, q.length), q));
  }
  return best;
}

// The matches that need no edits: the whole, the start, a word's start, a part.
function plainMatch(t: string, q: string): { score: number; hits: number[] } | undefined {
  const span = (from: number) => Array.from({ length: q.length }, (_, n) => from + n);
  if (t === q) return { score: 1000, hits: span(0) };
  if (t.startsWith(q)) return { score: 900, hits: span(0) };
  const part = t.indexOf(q);
  if (part > 0) return { score: WORD_START.test(t[part - 1] ?? "") ? 800 : 700, hits: span(part) };
  return undefined;
}

// A text a few edits from the query holds most of the query's letter pairs: one edit spoils three at most, so a text short of the rest
// is skipped before any edit is counted (which is what makes a misspelt word over thousands of names cost milliseconds).
function holdsPairs(t: string, q: string, allowed: number): boolean {
  // An edit loses one letter of the query at most: the text holds all its letters but `allowed`.
  const letters = Array.from(q).filter((letter) => t.includes(letter)).length;
  if (letters < q.length - allowed) return false;
  const need = q.length - 1 - 3 * allowed;
  let held = 0;
  for (let at = 0; at + 1 < q.length && held < need; at++) if (t.includes(q.slice(at, at + 2))) held++;
  return held >= need;
}

/** How well a lowercase text, with its words, answers a lowercase `q`, or none; `fuzzy` allows the letters off. */
export function matchLower(
  { lower: t, words }: { lower: string; words: readonly string[] },
  q: string,
  fuzzy: boolean,
): { score: number; hits: number[] } | undefined {
  if (q === "") return { score: 0, hits: [] };
  if (!fuzzy) {
    const plain = plainMatch(t, q);
    if (plain !== undefined) return plain;
    const hits = q.length >= 3 ? inOrder(t, q) : undefined;
    return hits === undefined ? undefined : { score: 400, hits };
  }
  const allowed = slack(q.length);
  if (allowed === 0 || !holdsPairs(t, q, allowed)) return undefined;
  const edits = fewestEdits({ lower: t, words }, q, allowed);
  return edits <= allowed ? { score: 300 - edits * 50, hits: [] } : undefined;
}

/** The words of a lowercase text, which a match a few letters off reads. */
export const wordsOf = (t: string): string[] => t.split(WORD_START);

/** How well `text` answers `query`, or none: its whole, its start, a word's start, a part, the letters in order, then a few letters off
 * (a missed, added, wrong or swapped one). The letters it matched are the hits. */
export function matchOf(text: string, query: string): { score: number; hits: number[] } | undefined {
  const t = text.toLowerCase();
  const q = query.toLowerCase();
  const text_ = { lower: t, words: wordsOf(t) };
  return matchLower(text_, q, false) ?? matchLower(text_, q, true);
}

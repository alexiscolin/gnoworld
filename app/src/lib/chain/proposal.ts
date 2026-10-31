// The GovDAO proposals a realm's home page lists, in the format RECORDED on gnoland-1 and onyx-1 (F2951, app/tests/chain/recorded/):
// `### [Prop #N - Title](/r/gov/dao:N)` and `Status: WORD`, no tally and no threshold. A proposer's title is text, bounded. Every
// pattern is linear, the page is read to a bound, nothing throws, the Zod schema has the last word.
import { cutGraphemes } from "@gnoworld/core";
import { PROPOSAL_CAPS, Proposal } from "@gnoworld/schemas/proposal";
import type { ChainRead, ReadOptions } from "./read.ts";
import { readPage } from "./rpc.ts";

export type { Proposal };

/** The most characters of a page that are read. */
const PAGE_READ = 64 * 1024;
/** The most proposals a home page gives. */
const LISTED_MAX = 50;

// A home page's entry, `### [Prop #14 - Title](/r/gov/dao:14)`: both numbers must agree.
const LISTED = /^###[ \t]+\[Prop[ \t]+#(\d{1,9})[ \t]+-[ \t]+(.*)\]\(\/r\/gov\/dao:(\d{1,9})\)$/;
// A home entry's line of state, `Status: ACTIVE`.
const STATUS = /^Status:[ \t]+(.+)$/;
// Markdown's backslash before a punctuation mark (`gno\-core`), which the realm adds to a title.
const ESCAPED = /\\([!-/:-@[-`{-~])/g;

// A text within `max` code units: cut at a grapheme with an ellipsis, then, for one grapheme of thousands of marks, at a unit.
function bounded(text: string, max: number): string {
  const cut = cutGraphemes(text.slice(0, 4 * max), max);
  return cut.length <= max ? cut : `${cut.slice(0, max - 1).replace(/[\uD800-\uDBFF]$/, "")}…`;
}

// A title as text: unescaped, trimmed, bounded.
const titleOf = (raw: string): string => bounded(raw.replace(ESCAPED, "$1").trim(), PROPOSAL_CAPS.title);

// The one match of a pattern among the lines, or none when no line or more than one line reads that way.
function only(lines: readonly string[], pattern: RegExp): RegExpExecArray | undefined {
  const found = lines.map((line) => pattern.exec(line)).filter((match) => match !== null);
  return found.length === 1 ? found[0] : undefined;
}

// The page's lines, trimmed and bounded.
const linesOf = (text: string): string[] =>
  text
    .slice(0, PAGE_READ)
    .split("\n")
    .map((line) => line.trim());

// The lines after index `from` up to the first rule or heading.
function blockAfter(lines: readonly string[], from: number): string[] {
  const rest = lines.slice(from + 1);
  const end = rest.findIndex((line) => line === "---" || line.startsWith("#"));
  return end < 0 ? rest : rest.slice(0, end);
}

// A proposal that fits the schema, or none.
function fitted(base: { id: number; title: string; state: string }): Proposal | undefined {
  const parsed = Proposal.safeParse(base);
  return parsed.success ? parsed.data : undefined;
}

/** The proposals a realm's home page lists, newest first as written, with the realm's word for each state and no tally. */
export function proposalsOf(text: string): Proposal[] {
  const lines = linesOf(text);
  const listed: Proposal[] = [];
  lines.forEach((line, at) => {
    const entry = listed.length >= LISTED_MAX ? null : LISTED.exec(line);
    if (entry === null || entry[1] !== entry[3]) return;
    const state = bounded((only(blockAfter(lines, at), STATUS)?.[1] ?? "").trim(), PROPOSAL_CAPS.state);
    const proposal = fitted({ id: Number(entry[1]), title: titleOf(entry[2] ?? ""), state });
    if (proposal !== undefined) listed.push(proposal);
  });
  return listed;
}

/** The proposals a realm's home page lists, newest first as written: one request, or a typed failure. */
export async function readProposals(
  rpc: string,
  realm: string,
  options: ReadOptions = {},
): Promise<ChainRead<Proposal[]>> {
  const page = await readPage(rpc, { realm }, options);
  return page.ok ? { ok: true, value: proposalsOf(page.value), source: page.source } : page;
}

// The GovDAO proposals a realm's home page lists, in the format RECORDED on gnoland-1 and onyx-1 (F2951, app/tests/chain/recorded/):
// `### [Prop #N - Title](/r/gov/dao:N)` and `Status: WORD`, no tally and no threshold; the newest open one's own page gives its yes
// and no (F4308), never a threshold. A proposer's words are text, bounded. Every pattern is linear, a page is read to a bound,
// nothing throws, the Zod schema has the last word.
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
// The realm's word for a proposal open for votes, on its home page.
const OPEN_STATE = "ACTIVE";
// A proposal's own page: its one block of stats, open or not, its yes and its no as `- YES PERCENT: 33.33333333333333%`.
const STATS = /^###[ \t]+Stats$/;
const OPEN = /^-[ \t]+\*\*Proposal is open for votes\*\*$/;
const YES = /^-[ \t]+YES PERCENT:[ \t]+(\d{1,3}(?:\.\d{1,20})?)%$/;
const NO = /^-[ \t]+NO PERCENT:[ \t]+(\d{1,3}(?:\.\d{1,20})?)%$/;
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
function fitted(base: { id: number; title: string; state: string; yes?: number; no?: number }): Proposal | undefined {
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

/** What a proposal's own page states of its votes: whether it is open, its yes and its no, 0 to 100, from its one block of stats; none
 * when a proposer's words hold a second block or a second line, or a share is none. */
export function votesOf(text: string): { open: boolean; yes: number; no: number } | undefined {
  const lines = linesOf(text);
  const heads = lines.flatMap((line, at) => (STATS.test(line) ? [at] : []));
  const [head] = heads;
  if (heads.length !== 1 || head === undefined) return undefined;
  const block = blockAfter(lines, head);
  const yes = Number(only(block, YES)?.[1] ?? Number.NaN);
  const no = Number(only(block, NO)?.[1] ?? Number.NaN);
  if (fitted({ id: 0, title: "votes", state: "", yes, no }) === undefined) return undefined;
  return { open: only(block, OPEN) !== undefined, yes, no };
}

/** The proposals a realm's home page lists, newest first as written, the newest open one with its yes and no from its own page: two
 * requests at most, or a typed failure of the first. A page of votes that does not come leaves the list as it is. */
export async function readProposals(
  rpc: string,
  realm: string,
  options: ReadOptions = {},
): Promise<ChainRead<Proposal[]>> {
  const page = await readPage(rpc, { realm }, options);
  if (!page.ok) return page;
  const listed = proposalsOf(page.value);
  const open = listed.find(({ state }) => state === OPEN_STATE);
  if (open === undefined) return { ok: true, value: listed, source: page.source };
  const own = await readPage(rpc, { realm, path: String(open.id) }, options);
  const votes = own.ok ? votesOf(own.value) : undefined;
  const voted = votes?.open === true ? fitted({ ...open, yes: votes.yes, no: votes.no }) : undefined;
  const value = voted === undefined ? listed : listed.map((each) => (each === open ? voted : each));
  return { ok: true, value, source: page.source };
}

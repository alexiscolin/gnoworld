// A GovDAO proposal from its realm's page, in the format RECORDED on gnoland-1 and onyx-1 (F2951, app/tests/chain/recorded/): a
// proposal's page has `## Prop #N - Title`, then the realm's LAST `### Stats` block (a bold state line, `- YES PERCENT: n%`, no
// threshold); the home page lists `### [Prop #N - Title](/r/gov/dao:N)` and `Status: WORD`. A proposer's text cannot forge a tally:
// fields come only from whole lines of that block, from none when two claim it. Limit: a page with no realm Stats block still
// reads a proposer's. Every pattern is linear, the page is read to a bound, nothing throws, the Zod schema has the last word.
import { cutGraphemes } from "@gnoworld/core";
import { PROPOSAL_CAPS, Proposal } from "@gnoworld/schemas";
import { failedRead, sourceOf, type ChainRead, type ReadOptions } from "./read.ts";
import { readPage } from "./rpc.ts";

export type { Proposal };

/** The most characters of a page that are read. */
const PAGE_READ = 64 * 1024;
/** The most proposals a home page gives. */
const LISTED_MAX = 50;

// A proposal page's first line, `## Prop #14 - Title`: the number, a dash, the title (checked by the schema).
const HEADING = /^##[ \t]+Prop[ \t]+#(\d{1,9})[ \t]+-[ \t]+(.*)$/;
// Any line that opens a proposal's heading, so a page of two is no page of one.
const HEADING_START = /^#{1,6}[ \t]+Prop[ \t]+#\d/;
// A home page's entry, `### [Prop #14 - Title](/r/gov/dao:14)`: both numbers must agree.
const LISTED = /^###[ \t]+\[Prop[ \t]+#(\d{1,9})[ \t]+-[ \t]+(.*)\]\(\/r\/gov\/dao:(\d{1,9})\)$/;
// The realm's Stats block begins here.
const STATS = "### Stats";
// A Stats line that is the state, `- **Proposal is open for votes**`, and nothing else.
const STATE = /^-[ \t]+\*\*(.+)\*\*$/;
// A Stats line that is the yes share, `- YES PERCENT: 33.33333333333333%`, and nothing else.
const YES = /^-[ \t]+YES PERCENT:[ \t]+(\d{1,3}(?:\.\d{1,17})?)%$/;
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

// A proposal that fits the schema: a yes share past 100 is no share, and the proposal stands without it.
function fitted(base: { id: number; title: string; state: string }, yes?: number): Proposal | undefined {
  const withYes = yes === undefined ? undefined : Proposal.safeParse({ ...base, yes });
  const parsed = withYes?.success === true ? withYes : Proposal.safeParse(base);
  return parsed.success ? parsed.data : undefined;
}

// The state and the yes share of the realm's Stats block among a proposal page's lines, each only when one line states it.
function statsOf(lines: readonly string[]): { state: string; yes?: number } {
  const stats = lines.lastIndexOf(STATS);
  const block = stats < 0 ? [] : blockAfter(lines, stats);
  const yes = only(block, YES)?.[1];
  const state = bounded((only(block, STATE)?.[1] ?? "").trim(), PROPOSAL_CAPS.state);
  return yes === undefined ? { state } : { state, yes: Number(yes) };
}

/** The proposal a proposal's own page describes, or nothing when it describes none. */
export function proposalOf(text: string): Proposal | undefined {
  const lines = linesOf(text);
  const first = lines.findIndex((line) => line !== "");
  const heading = first < 0 ? null : HEADING.exec(lines[first] ?? "");
  const rest = lines.slice(first + 1);
  if (heading === null || rest.some((line) => HEADING_START.test(line))) return undefined;
  const { state, yes } = statsOf(rest);
  return fitted({ id: Number(heading[1]), title: titleOf(heading[2] ?? ""), state }, yes);
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

/** The words of a proposal's tally, `YES 33% of 66.66%`: the yes to a whole percent, the threshold to two decimals with no
 * trailing zero; none unless the page gave both. The pill and the card say the same words from here. */
export function tallyOf(proposal: Pick<Proposal, "yes" | "threshold">): string | undefined {
  const { yes, threshold } = proposal;
  if (yes === undefined || threshold === undefined) return undefined;
  return `YES ${String(Math.round(yes))}% of ${String(Number(threshold.toFixed(2)))}%`;
}

/** One proposal of a realm, read from its page of that number: one request, or a typed failure. */
export async function readProposal(
  rpc: string,
  { realm, id }: { realm: string; id: number },
  options: ReadOptions = {},
): Promise<ChainRead<Proposal>> {
  const page =
    Number.isSafeInteger(id) && id >= 0 ? await readPage(rpc, { realm, path: String(id) }, options) : undefined;
  if (page === undefined) return failedRead("bad-name", sourceOf(rpc, options));
  if (!page.ok) return page;
  const proposal = proposalOf(page.value);
  return proposal?.id === id
    ? { ok: true, value: proposal, source: page.source }
    : failedRead("wrong-shape", page.source);
}

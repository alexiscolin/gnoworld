// A GovDAO proposal, from the text of its realm's page (slice 5 part 2, 5k). THE PAGE'S FORMAT IS A GUESS (ledger F2951): no
// page is recorded, so the rules below read a first line `# Proposal #<id>: <title>`, then a line of its own `Status: <word>` and
// a line of its own `YES <n>% (threshold <n>%)`, and a real page is for a gnomcp session to confirm. What does not depend on the
// format: the page is read only up to a bound; a field comes only from a line that holds nothing else, never from the title or
// from a sentence, and from none when two lines claim it (a proposer's words are not the realm's tally); every pattern runs on one
// line and is linear; nothing here throws; the result goes through the `Proposal` schema. Votes stay in their realm.
import { cutGraphemes } from "@gnoworld/core";
import { PROPOSAL_CAPS, Proposal } from "@gnoworld/schemas";
import { failedRead, sourceOf, type ChainRead, type ReadOptions } from "./read.ts";
import { readPage } from "./rpc.ts";

export type { Proposal };

/** The most characters of a page that are read. */
const PAGE_READ = 64 * 1024;

// A first line, `# Proposal #15: Title`: one mark, a number, a colon, the title (checked by the schema).
const HEADING = /^#[ \t]+Proposal[ \t]+#(\d{1,9}):(.*)$/;
// Any line that opens a proposal's heading, so a page of two is no page of one.
const HEADING_START = /^#{1,6}[ \t]+Proposal[ \t]+#\d/;
// A line that is a state, `Status: active` or `**Status:** active`, and nothing else before the word.
const STATUS = /^(?:\*\*)?Status:(?:\*\*)?[ \t]*(.*)$/;
// A line that is a tally, `YES 33% (threshold 66.66%)`, and nothing else.
const TALLY = /^YES[ \t]+(\d{1,3}(?:\.\d{1,4})?)%[ \t]+\(threshold[ \t]+(\d{1,3}(?:\.\d{1,4})?)%\)$/;

// A text within `max` code units: cut at a grapheme with an ellipsis, then, for one grapheme of thousands of marks, at a unit.
function bounded(text: string, max: number): string {
  const cut = cutGraphemes(text.slice(0, 4 * max), max);
  return cut.length <= max ? cut : `${cut.slice(0, max - 1).replace(/[\uD800-\uDBFF]$/, "")}…`;
}

// The one match of a pattern among the lines, or none when no line or more than one line reads that way.
function only(lines: readonly string[], pattern: RegExp): RegExpExecArray | undefined {
  const found = lines.map((line) => pattern.exec(line)).filter((match) => match !== null);
  return found.length === 1 ? found[0] : undefined;
}

// The page's lines, trimmed, past its first non-blank one, which must be the heading; none otherwise.
function bodyOf(text: string): { heading: RegExpExecArray; rest: string[] } | undefined {
  const lines = text
    .slice(0, PAGE_READ)
    .split("\n")
    .map((line) => line.trim());
  const first = lines.findIndex((line) => line !== "");
  const heading = first < 0 ? null : HEADING.exec(lines[first] ?? "");
  const rest = lines.slice(first + 1);
  return heading === null || rest.some((line) => HEADING_START.test(line)) ? undefined : { heading, rest };
}

/** The proposal a page describes, or nothing when it describes none. */
export function proposalOf(text: string): Proposal | undefined {
  const body = bodyOf(text);
  if (body === undefined) return undefined;
  const tally = only(body.rest, TALLY);
  const fields = {
    id: Number(body.heading[1]),
    title: bounded((body.heading[2] ?? "").trim(), PROPOSAL_CAPS.title),
    state: bounded((only(body.rest, STATUS)?.[1] ?? "").trim(), PROPOSAL_CAPS.state),
  };
  // A tally with a share past 100 is no tally: the proposal stands without it.
  const withTally =
    tally === undefined
      ? undefined
      : Proposal.safeParse({ ...fields, yes: Number(tally[1]), threshold: Number(tally[2]) });
  const parsed = withTally?.success === true ? withTally : Proposal.safeParse(fields);
  return parsed.success ? parsed.data : undefined;
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

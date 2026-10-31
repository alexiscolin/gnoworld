// A GovDAO proposal, from the text of its realm's page (slice 5 part 2, 5k). THE PAGE'S FORMAT IS A GUESS (ledger F2951): no
// page is recorded, so the rules below read a heading `# Proposal #<id>: <title>`, a `Status:` line and a `YES <n>%` and
// `threshold <n>%` pair, and a real page is for a gnomcp session to confirm. What does not depend on the format: the page is
// read only up to a bound, nothing here throws, every field is bounded, and the realm's words stay text. Votes stay in their realm.
import { cutGraphemes } from "@gnoworld/core";
import { failedRead, type ChainRead, type ReadOptions } from "./read.ts";
import { readPage } from "./rpc.ts";

export interface Proposal {
  readonly id: number;
  readonly title: string;
  readonly state: string;
  /** The share of yes votes, 0 to 100, when the page said it. */
  readonly yes?: number;
  /** The share of yes the proposal needs, 0 to 100, when the page said it. */
  readonly threshold?: number;
}

/** The most characters of a page that are read, of a title and of a state. */
const PAGE_READ = 64 * 1024;
const TITLE_MAX = 200;
const STATE_MAX = 40;

/** Whether a number is a share of a whole: finite, 0 to 100. */
export const isShare = (value: number | undefined): value is number =>
  value !== undefined && Number.isFinite(value) && value >= 0 && value <= 100;

/** Whether a number is a proposal's: a whole number of 0 or more. */
export const isProposalId = (id: number): boolean => Number.isSafeInteger(id) && id >= 0;

// A percentage written after a label, or none; a figure out of 0 to 100 is none.
function shareAfter(label: RegExp, page: string): number | undefined {
  const text = label.exec(page)?.[1];
  const share = text === undefined ? undefined : Number(text);
  return isShare(share) ? share : undefined;
}

/** The proposal a page describes, or nothing when it describes none. */
export function proposalOf(text: string): Proposal | undefined {
  const page = text.slice(0, PAGE_READ);
  const head = /^#{1,3}[ \t]+Proposal[ \t]+#(\d{1,9})(?![\d.])[ \t]*[:-]?[ \t]*(.+)$/m.exec(page);
  if (head?.[1] === undefined || head[2] === undefined) return undefined;
  const title = head[2].trim();
  if (title === "") return undefined;
  const state = /^[ \t*]*Status[ \t]*:?[ \t*]*:?[ \t]*(.*)$/im.exec(page)?.[1]?.replace(/\*+/g, "").trim() ?? "";
  const yes = shareAfter(/\bYES[ \t]+(\d+(?:\.\d+)?)[ \t]*%/, page);
  const threshold = shareAfter(/\bthreshold[ \t]*:?[ \t]*(\d+(?:\.\d+)?)[ \t]*%/i, page);
  return {
    id: Number(head[1]),
    title: cutGraphemes(title, TITLE_MAX),
    state: cutGraphemes(state, STATE_MAX),
    ...(yes === undefined ? {} : { yes }),
    ...(threshold === undefined ? {} : { threshold }),
  };
}

/** The words of a proposal's tally, `YES 33% of 66.66%`: the yes to a whole percent, the threshold to two decimals with no
 * trailing zero; none unless the page gave both, each a share. The pill and the card say the same words from here. */
export function tallyOf(proposal: Pick<Proposal, "yes" | "threshold">): string | undefined {
  const { yes, threshold } = proposal;
  if (!isShare(yes) || !isShare(threshold)) return undefined;
  return `YES ${String(Math.round(yes))}% of ${String(Number(threshold.toFixed(2)))}%`;
}

/** One proposal of a realm, read from its page of that number: one request, or a typed failure. */
export async function readProposal(
  rpc: string,
  { realm, id }: { realm: string; id: number },
  options: ReadOptions = {},
): Promise<ChainRead<Proposal>> {
  const page = isProposalId(id) ? await readPage(rpc, { realm, path: String(id) }, options) : undefined;
  if (page === undefined) {
    return failedRead("bad-name", { url: rpc, at: (options.now ?? (() => new Date()))().toISOString() });
  }
  if (!page.ok) return page;
  const proposal = proposalOf(page.value);
  return proposal?.id === id
    ? { ok: true, value: proposal, source: page.source }
    : failedRead("wrong-shape", page.source);
}

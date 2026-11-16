// A world's name and its signs (ADR-0002 §1, §10), for the rail: a name is plain text and never an address; a new world nobody here
// visited is an uncharted signal, unnamed till charted.
import { cutText } from "../bubbles/cut.ts";
import { looksLikeAddress } from "../chain/evalName.ts";
import { firstGraphemes } from "../markdown/graphemes.ts";

/** The most graphemes of a name. */
export const NAME_MOST = 24;

/** The page's rail, at the window's right edge from 900 px wide: its footprint, from that edge to its own left edge (frame 4: x 1,585
 * at 1,728 px). The rail takes its width from it. */
export const RAIL = { from: 900, footprint: 143 } as const;

const UNCHARTED = "Uncharted signal";

type LabelKind = "earth" | "near" | "far";

/** What the data says of a world now: its people here, its messages an hour, its rise when it rises, its distinct callers, and whether it is
 * new and unvisited. Absent is unknown. */
export interface Signals {
  readonly here?: number;
  readonly perHour?: number;
  readonly rise?: number;
  readonly use?: number;
  readonly uncharted?: boolean;
  /** The world's next event within the day, as its chip says it ("AMA in 11 h", frames 4 and 6). */
  readonly event?: string;
  /** A person the reader follows who is in one of its rooms, as its chip says it ("noor is here"). */
  readonly person?: string;
}

export interface LabelAsk {
  readonly id: string;
  readonly kind: LabelKind;
  /** A name the data gives the world, a hub's. */
  readonly name?: string;
  readonly signals?: Signals;
}

// Cut between graphemes, an ellipsis last, so a pair never splits.
function cut(name: string): string {
  return firstGraphemes(name, NAME_MOST + 1).length > NAME_MOST
    ? `${firstGraphemes(name, NAME_MOST - 1).join("")}…`
    : name;
}

/** A world's name from its id: the last of its segments that holds no address, as a person names a place ("streak", not
 * "x/daily/streak"); none where only an address names it. */
export function labelName(id: string): string | null {
  const last = id
    .split("/")
    .filter((segment) => segment !== "" && !looksLikeAddress(segment))
    .at(-1);
  return last === undefined ? null : cut(last);
}

// A name the data gives, cleaned as a bubble's text (bubbles/cut.ts) on one line: no address, never blank.
function givenName(name: string | undefined): string | null {
  const plain = cutText(name ?? "", 4 * NAME_MOST)
    .replace(/\s+/g, " ")
    .trim();
  return plain === "" || looksLikeAddress(plain) ? null : cut(plain);
}

/** A world's title on the rail: the Earth's, a new world's as an uncharted signal, else its name; none for an address. */
export function titleOf({ id, kind, name, signals }: LabelAsk): string | null {
  if (kind === "earth") return "Earth";
  if (signals?.uncharted === true) return UNCHARTED;
  return givenName(name) ?? labelName(id);
}

// Rise first, then people here, then use; a tie by id, so the order the asks come in moves nothing. Weighed once an ask.
type Weighed = readonly [LabelAsk, readonly [number, number, number]];
const weighed = (ask: LabelAsk): Weighed => {
  const { rise = -1, here = 0, use = 0 } = ask.signals ?? {};
  return [ask, [rise, here, use]];
};
function ranked([a, one]: Weighed, [b, other]: Weighed): number {
  for (let at = 0; at < one.length; at += 1) if (one[at] !== other[at]) return (other[at] ?? 0) - (one[at] ?? 0);
  return a.id < b.id ? -1 : 1;
}
/** The most popular first: the most rise, then the most people here, then the most callers; a tie by id. The rail's trends and rising worlds. */
export const mostPopular = <Ask extends LabelAsk>(asks: readonly Ask[]): Ask[] =>
  asks
    .map((ask) => [ask, weighed(ask)[1]] as const)
    .sort(ranked)
    .map(([ask]) => ask);

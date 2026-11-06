// The labels of a view (ADR-0002 §1, level of detail; plan §9, question 11): eight at most, the Earth first, then the worlds the view draws,
// then a few far ones among the most popular and the new. Signs mean real data (ADR-0002 §10): a far world nothing names gets no label, and
// a count or a badge shows only what the data says. A name is plain text and never an address; a new world nobody here visited is an
// uncharted signal, unnamed till charted.
import { cutText } from "../bubbles/cut.ts";
import { looksLikeAddress } from "../chain/evalName.ts";
import { firstGraphemes } from "../markdown/graphemes.ts";

/** The most labels a view shows, the most of them far worlds, and the most graphemes of a name. */
export const LABELS_MOST = 8;
export const FAR_MOST = 3;
export const NAME_MOST = 24;

/** The page's rail (7i), at the window's right edge from 900 px wide: its footprint, from that edge to its own left edge (frame 4: x 1,585
 * at 1,728 px, 7h2's measure). The labels keep it and their air clear; the rail takes its width from it. */
export const RAIL = { from: 900, footprint: 143 } as const;

const UNCHARTED = "Uncharted signal";
const GO_AND_LOOK = "go and look";

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
  /** A person the reader follows who is in one of its rooms, as its chip says it ("noor is here", decision 714). */
  readonly person?: string;
}

export interface LabelAsk {
  readonly id: string;
  readonly kind: LabelKind;
  /** A name the data gives the world, a hub's. */
  readonly name?: string;
  readonly signals?: Signals;
}

export interface Label {
  readonly id: string;
  readonly kind: LabelKind;
  readonly title: string;
  readonly count: string;
  readonly badge: string;
  /** Its chips after the badge, none or empty for none: the coming event's and the followed person's. */
  readonly event?: string;
  readonly person?: string;
  readonly uncharted: boolean;
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

/** A world's title on its label and on the rail: the Earth's, a new world's as an uncharted signal, else its name; none for an address. */
export function titleOf({ id, kind, name, signals }: LabelAsk): string | null {
  if (kind === "earth") return "Earth";
  if (signals?.uncharted === true) return UNCHARTED;
  return givenName(name) ?? labelName(id);
}

function countOf({ here = 0, uncharted = false }: Signals): string {
  const people = here > 0 ? `${String(Math.round(here))} here` : "";
  if (!uncharted) return people;
  return people === "" ? GO_AND_LOOK : `${people} · ${GO_AND_LOOK}`;
}

function badgeOf({ rise, perHour = 0 }: Signals): string {
  const parts = [
    rise === undefined ? "" : `▲ ${String(Math.round(rise * 100))}%`,
    perHour >= 1 ? `${String(Math.round(perHour))}/h` : "",
  ];
  return parts.filter((part) => part !== "").join(" · ");
}

/** Whether real data names a world: people here, a rise, a use, a new world unvisited, an event coming or a person followed in it. A far
 * world with none asks for no label. */
export const known = ({ here = 0, rise, use = 0, uncharted = false, event, person }: Signals): boolean =>
  here > 0 || rise !== undefined || use > 0 || uncharted || event !== undefined || person !== undefined;

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
/** The most popular first: the most rise, then the most people here, then the most callers; a tie by id. The labels' far worlds and the
 * rail's trends and rising worlds alike (7i). */
export const mostPopular = <Ask extends LabelAsk>(asks: readonly Ask[]): Ask[] =>
  asks
    .map((ask) => [ask, weighed(ask)[1]] as const)
    .sort(ranked)
    .map(([ask]) => ask);

// The far worlds to label: the most popular, and one new one beside them, or more new ones where nothing else is known.
function farOf(asks: readonly LabelAsk[], taken: ReadonlySet<string>): LabelAsk[] {
  const far = asks.filter(
    (ask) => ask.kind === "far" && !taken.has(ask.id) && known(ask.signals ?? {}) && titleOf(ask) !== null,
  );
  const fresh = mostPopular(far.filter(({ signals }) => signals?.uncharted === true));
  const popular = mostPopular(far.filter(({ signals }) => signals?.uncharted !== true));
  return [...popular.slice(0, FAR_MOST - Math.min(fresh.length, 1)), ...fresh].slice(0, FAR_MOST);
}

function labelOf(ask: LabelAsk, title: string): Label {
  const signals = ask.signals ?? {};
  const uncharted = ask.kind !== "earth" && signals.uncharted === true;
  // An uncharted signal is unnamed till charted: nothing of its people or its events.
  const chips = uncharted
    ? {}
    : {
        ...(signals.event === undefined ? {} : { event: signals.event }),
        ...(signals.person === undefined ? {} : { person: signals.person }),
      };
  return { id: ask.id, kind: ask.kind, title, count: countOf(signals), badge: badgeOf(signals), ...chips, uncharted };
}

/** The labels a view shows, in their order: the Earth, the bodies it draws in the order given, then its far worlds. */
export function chooseLabels(asks: readonly LabelAsk[]): Label[] {
  const made: Label[] = [];
  const taken = new Set<string>();
  const take = (ask: LabelAsk) => {
    const title = titleOf(ask);
    if (title === null || taken.has(ask.id) || made.length >= LABELS_MOST) return;
    taken.add(ask.id);
    made.push(labelOf(ask, title));
  };
  for (const ask of asks) if (ask.kind === "earth") take(ask);
  for (const ask of asks) if (ask.kind === "near") take(ask);
  for (const ask of farOf(asks, taken)) take(ask);
  return made;
}

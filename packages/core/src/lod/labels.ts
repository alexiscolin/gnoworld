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

/** Whether real data names a world: people here, a rise, a use, or a new world unvisited. A far world with none asks for no label. */
export const known = ({ here = 0, rise, use = 0, uncharted = false }: Signals): boolean =>
  here > 0 || rise !== undefined || use > 0 || uncharted;

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
const best = (asks: readonly LabelAsk[]) =>
  asks
    .map(weighed)
    .sort(ranked)
    .map(([ask]) => ask);

// The far worlds to label: the most popular, and one new one beside them, or more new ones where nothing else is known.
function farOf(asks: readonly LabelAsk[], taken: ReadonlySet<string>): LabelAsk[] {
  const far = asks.filter(
    (ask) => ask.kind === "far" && !taken.has(ask.id) && known(ask.signals ?? {}) && titleOf(ask) !== null,
  );
  const fresh = best(far.filter(({ signals }) => signals?.uncharted === true));
  const popular = best(far.filter(({ signals }) => signals?.uncharted !== true));
  return [...popular.slice(0, FAR_MOST - Math.min(fresh.length, 1)), ...fresh].slice(0, FAR_MOST);
}

function labelOf(ask: LabelAsk, title: string): Label {
  const signals = ask.signals ?? {};
  const uncharted = ask.kind !== "earth" && signals.uncharted === true;
  return { id: ask.id, kind: ask.kind, title, count: countOf(signals), badge: badgeOf(signals), uncharted };
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

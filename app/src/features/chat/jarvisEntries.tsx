// Jarvis's cards among a room's lines (10u-a), the asker's alone and on this device (D1017): each stands where it was asked, before the
// first entry that is newer. How a card is drawn is the panel's host's (features/jarvis), which comes when Jarvis is first asked.
import { JARVIS_NICK, plainWords as plain } from "@gnoworld/core";
import type { ReactNode } from "react";
import { useJarvisDrawing, type JarvisItem } from "../../jarvisHere.ts";
import type { Entry } from "./chainEntries.ts";

/** A card of Jarvis, with the key its item is drawn under. */
export interface JarvisEntry {
  jarvis: JarvisItem;
  key: string;
}

const timeOf = (entry: Entry<{ time: string }>): string => ("line" in entry ? entry.line.time : entry.call.at);

// A question to Jarvis goes to the room too, which hears it a moment after the ask: a card stands right after the asker's line that holds
// its question, a minute at most after the ask. With no such line it waits this long past its ask before the entries newer than that.
const HEARD_MS = 5000;
const ASKED_MS = 60_000;
// Jarvis's own line, said when its answer came, within this of the question's line, is the same answer as the asker's card.
const SAID_MS = 5 * 60_000;
const heardAt = (at: string): string => new Date(Date.parse(at) + HEARD_MS).toISOString();

/** What an entry's line needs to be matched to a card: who said what, and when. */
interface Spoken {
  time: string;
  text?: string;
  account?: string;
  from?: string;
}

const within = (from: string, to: string, ms: number): boolean => {
  const gap = Date.parse(to) - Date.parse(from);
  return gap >= 0 && gap <= ms;
};

/** The entries and the cards in one order, oldest first: a card stands after the line of its asker that holds its question, else before the
 * first entry newer than its ask and the moment its question takes to be heard. A card whose answer Jarvis's own line gives is left out. */
export function withJarvis<L extends Spoken>(
  entries: readonly Entry<L>[],
  items: readonly JarvisItem[],
): readonly (Entry<L> | JarvisEntry)[] {
  if (items.length === 0) return entries;
  const { after, loose } = placing(entries, items);
  const placed: (Entry<L> | JarvisEntry)[] = [];
  for (const [at, entry] of entries.entries()) {
    while (loose[0] !== undefined && heardAt(loose[0].jarvis.at) < timeOf(entry)) placed.push(...loose.splice(0, 1));
    placed.push(entry, ...(after.get(at) ?? []));
  }
  return placed.concat(loose);
}

// Each card, oldest ask first: after the entry that holds its question (by that entry's index), or loose; none when Jarvis's own line has it.
function placing<L extends Spoken>(entries: readonly Entry<L>[], items: readonly JarvisItem[]) {
  const cards = items.toSorted((a, b) => (a.at < b.at ? -1 : a.at > b.at ? 1 : 0));
  const taken = new Set<number>();
  const after = new Map<number, JarvisEntry[]>();
  const loose: JarvisEntry[] = [];
  for (const [at, item] of cards.entries()) {
    const own = questionOf(entries, item, taken);
    if (own === undefined) loose.push(cardAt(cards, at));
    else if (!answeredBy(entries, own, item)) after.set(own, [...(after.get(own) ?? []), cardAt(cards, at)]);
  }
  return { after, loose };
}

// The index of the entry whose line is the asker's, at or after the ask, with the question's words in it, not taken by another card.
function questionOf<L extends Spoken>(
  entries: readonly Entry<L>[],
  item: JarvisItem,
  taken: Set<number>,
): number | undefined {
  const words = item.ask !== undefined && "question" in item.ask ? plain(item.ask.question) : "";
  if (words === "" || item.account === undefined) return undefined;
  const at = entries.findIndex(
    (entry, index) =>
      "line" in entry &&
      !taken.has(index) &&
      entry.line.account === item.account &&
      within(item.at, entry.line.time, ASKED_MS) &&
      plain(entry.line.text ?? "").includes(words),
  );
  if (at >= 0) taken.add(at);
  return at >= 0 ? at : undefined;
}

// Whether the card holds an answer that Jarvis's own line, after the question's, already gives the room.
function answeredBy<L extends Spoken>(entries: readonly Entry<L>[], asked: number, item: JarvisItem): boolean {
  const question = entries[asked];
  if (
    question === undefined ||
    !("line" in question) ||
    item.result?.ok !== true ||
    item.result.value.status !== "answered"
  )
    return false;
  const { time } = question.line;
  return entries
    .slice(asked + 1)
    .some((entry) => "line" in entry && entry.line.from === JARVIS_NICK && within(time, entry.line.time, SAID_MS));
}

function cardAt(cards: readonly JarvisItem[], at: number): JarvisEntry {
  const jarvis = cards[at];
  if (jarvis === undefined) throw new Error("no such card");
  return { jarvis, key: `jarvis ${jarvis.id}` };
}

/** One card as a list item, once the host has said how it is drawn. */
export function JarvisSlot({ item }: { item: JarvisItem }): ReactNode {
  const draw = useJarvisDrawing();
  return draw === undefined ? null : <li data-jarvis="">{draw(item)}</li>;
}

// Jarvis's cards among a room's lines (10u-a), the asker's alone and on this device (D1017): each stands where it was asked, before the
// first entry that is newer. How a card is drawn is the panel's host's (features/jarvis), which comes when Jarvis is first asked.
import type { ReactNode } from "react";
import { useJarvisDrawing, type JarvisItem } from "../../jarvisHere.ts";
import type { Entry } from "./chainEntries.ts";

/** A card of Jarvis, with the key its item is drawn under. */
export interface JarvisEntry {
  jarvis: JarvisItem;
  key: string;
}

const timeOf = (entry: Entry<{ time: string }>): string => ("line" in entry ? entry.line.time : entry.call.at);

// A question to Jarvis goes to the room too, which hears it a moment after the ask: a card waits this long past its ask, so it stands
// after its own question. ponytail: a fixed wait, the question's own msgid tied to the card if a slow room ever puts it after.
const HEARD_MS = 5000;
const heardAt = (at: string): string => new Date(Date.parse(at) + HEARD_MS).toISOString();

/** The entries and the cards in one order, oldest first: a card stands before the first entry newer than its ask and the moment its
 * question takes to be heard. */
export function withJarvis<L extends { time: string }>(
  entries: readonly Entry<L>[],
  items: readonly JarvisItem[],
): readonly (Entry<L> | JarvisEntry)[] {
  if (items.length === 0) return entries;
  const placed: (Entry<L> | JarvisEntry)[] = [];
  let next = 0;
  const cards = items.toSorted((a, b) => (a.at < b.at ? -1 : a.at > b.at ? 1 : 0));
  for (const entry of entries) {
    for (; next < cards.length && heardAt(cards[next]?.at ?? "") < timeOf(entry); next += 1)
      placed.push(cardAt(cards, next));
    placed.push(entry);
  }
  for (; next < cards.length; next += 1) placed.push(cardAt(cards, next));
  return placed;
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

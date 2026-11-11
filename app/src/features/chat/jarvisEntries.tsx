// Jarvis's cards among a room's lines (10u-a), the asker's alone and on this device (D1017): each stands where it was asked, before the
// first entry that is newer. How a card is drawn is the panel's host's (features/jarvis), which comes when Jarvis is first asked.
import { lazy, Suspense, type ReactNode } from "react";
import { useJarvisDrawing, type JarvisItem } from "../../jarvisHere.ts";
import type { Entry } from "./chainEntries.ts";

// The market card's chunk, asked when the first one is drawn.
const MarketCard = lazy(() => import("./MarketCard.tsx"));

/** A card of Jarvis, with the key its item is drawn under. */
export interface JarvisEntry {
  jarvis: JarvisItem;
  key: string;
}

const timeOf = (entry: Entry<{ time: string }>): string => ("line" in entry ? entry.line.time : entry.call.at);

/** The entries and the cards in one order, oldest first: a card stands before the first entry newer than the time it was asked. */
export function withJarvis<L extends { time: string }>(
  entries: readonly Entry<L>[],
  items: readonly JarvisItem[],
): readonly (Entry<L> | JarvisEntry)[] {
  if (items.length === 0) return entries;
  const placed: (Entry<L> | JarvisEntry)[] = [];
  let next = 0;
  const cards = items.toSorted((a, b) => (a.at < b.at ? -1 : a.at > b.at ? 1 : 0));
  for (const entry of entries) {
    for (; next < cards.length && (cards[next]?.at ?? "") < timeOf(entry); next += 1) placed.push(cardAt(cards, next));
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
  if (item.market === true) {
    return (
      <li data-market="">
        <Suspense fallback={null}>
          <MarketCard only={item.symbols} />
        </Suspense>
      </li>
    );
  }
  return draw === undefined ? null : <li data-jarvis="">{draw(item)}</li>;
}

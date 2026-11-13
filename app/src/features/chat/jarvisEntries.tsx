// Jarvis's cards among a room's lines (10u-a), the asker's alone and on this device (D1017): each stands where it was asked, before the
// first entry that is newer. How a card is drawn is the panel's host's (features/jarvis), which comes when Jarvis is first asked.
import { JARVIS_NICK, plainWords as plain } from "@gnoworld/core";
import { hashKey } from "@tanstack/react-query";
import { useSyncExternalStore, type ReactNode } from "react";
import { useJarvisDrawing, type JarvisItem } from "../../jarvisHere.ts";
import type { KeptAnswer } from "../../lib/api/jarvis.ts";
import { queryClient } from "../../lib/query/client.ts";
import type { Entry } from "./chainEntries.ts";

/** The kept answer of a line Jarvis said, once the page has read it (JarvisSaid.tsx); none before. */
export type SaidAnswer = (msgid: string) => KeptAnswer | undefined;

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

// `before` is how far before `from` a time still counts: a card is dated on the page's clock, which may run ahead of the room's.
const within = (from: number, to: string, { after, before = 0 }: { after: number; before?: number }): boolean => {
  const gap = Date.parse(to) - from;
  return gap >= -before && gap <= after;
};

/** The entries and the cards in one order, oldest first: a card stands after the line of its asker that holds its question, else before the
 * first entry newer than its ask and the moment its question takes to be heard. A card whose answer Jarvis's own line gives is left out. */
export function withJarvis<L extends Spoken & { id?: string }>(
  entries: readonly Entry<L>[],
  items: readonly JarvisItem[],
  said: SaidAnswer = () => undefined,
): readonly (Entry<L> | JarvisEntry)[] {
  if (items.length === 0) return entries;
  const { after, loose } = placing(entries, items, said);
  const placed: (Entry<L> | JarvisEntry)[] = [];
  for (const [at, entry] of entries.entries()) {
    while (loose[0] !== undefined && heardAt(loose[0].jarvis.at) < timeOf(entry)) placed.push(...loose.splice(0, 1));
    placed.push(entry, ...(after.get(at) ?? []));
  }
  return placed.concat(loose);
}

// Each card, oldest ask first: after the entry that holds its question (by that entry's index), or loose; none when Jarvis's own line has it.
function placing<L extends Spoken & { id?: string }>(
  entries: readonly Entry<L>[],
  items: readonly JarvisItem[],
  said: SaidAnswer,
) {
  const cards = items.toSorted((a, b) => (a.at < b.at ? -1 : a.at > b.at ? 1 : 0));
  const taken = new Set<number>();
  const after = new Map<number, JarvisEntry[]>();
  const loose: JarvisEntry[] = [];
  for (const [at, item] of cards.entries()) {
    const own = questionOf(entries, item, taken);
    if (own === undefined) loose.push(cardAt(cards, at));
    else if (!answeredBy(entries, own, { item, said })) after.set(own, [...(after.get(own) ?? []), cardAt(cards, at)]);
  }
  return { after, loose };
}

// The index of the entry whose line is the asker's, from just before the ask on, with the question's words in it, not taken by another card.
function questionOf<L extends Spoken>(
  entries: readonly Entry<L>[],
  item: JarvisItem,
  taken: Set<number>,
): number | undefined {
  const words = item.ask !== undefined && "question" in item.ask ? plain(item.ask.question) : "";
  if (words === "" || item.account === undefined) return undefined;
  const asked = Date.parse(item.at);
  const at = entries.findIndex(
    (entry, index) =>
      "line" in entry &&
      !taken.has(index) &&
      entry.line.account === item.account &&
      within(asked, entry.line.time, { after: ASKED_MS, before: HEARD_MS }) &&
      plain(entry.line.text ?? "").includes(words),
  );
  if (at >= 0) taken.add(at);
  return at >= 0 ? at : undefined;
}

// Whether the card holds an answer that Jarvis's own line, after the question's, already gives the room. The line names no asker: once its
// kept answer is read, a line whose answer is not the card's is another asker's and hides nothing.
function answeredBy<L extends Spoken & { id?: string }>(
  entries: readonly Entry<L>[],
  asked: number,
  { item, said }: { item: JarvisItem; said: SaidAnswer },
): boolean {
  const question = entries[asked];
  if (
    question === undefined ||
    !("line" in question) ||
    item.result?.ok !== true ||
    item.result.value.status !== "answered"
  )
    return false;
  const { markdown } = item.result.value;
  const when = Date.parse(question.line.time);
  const own = (line: L) => {
    const kept = line.id === undefined ? undefined : said(line.id)?.answer;
    return kept === undefined || (kept.status === "answered" && kept.markdown === markdown);
  };
  return entries
    .slice(asked + 1)
    .some(
      (entry) =>
        "line" in entry &&
        entry.line.from === JARVIS_NICK &&
        within(when, entry.line.time, { after: SAID_MS }) &&
        own(entry.line),
    );
}

// The kept answers of Jarvis's lines the query cache holds, by room and msgid, made again only after the cache told a change of one.
let told = 0;
let made = -1;
let answers: ReadonlyMap<string, KeptAnswer> = new Map();
const keyOf = (room: string, msgid: string) => `${room} ${msgid}`;
// A said answer's hash begins so (keys.jarvisSaid): the cache's events carry the query untyped.
const SAID = hashKey(["jarvis", "said"]).slice(0, -1);
const subscribeSaid = (heard: () => void) =>
  queryClient.getQueryCache().subscribe(({ query: { queryHash } }) => {
    if (!queryHash.startsWith(SAID)) return;
    told += 1;
    heard();
  });
const saidNow = (): ReadonlyMap<string, KeptAnswer> => {
  if (made === told) return answers;
  made = told;
  answers = new Map(
    queryClient
      .getQueryCache()
      .findAll({ queryKey: ["jarvis", "said"] })
      .flatMap(({ queryKey }): [string, KeptAnswer][] => {
        const [, , room, msgid] = queryKey;
        const data = queryClient.getQueryData<KeptAnswer>(queryKey);
        return typeof room === "string" && typeof msgid === "string" && data !== undefined
          ? [[keyOf(room, msgid), data]]
          : [];
      }),
  );
  return answers;
};

/** The kept answers of the room's Jarvis lines the page has read, a new reader each time one comes. */
export function useSaidAnswers(room: string | undefined): SaidAnswer {
  const held = useSyncExternalStore(subscribeSaid, saidNow, saidNow);
  return (msgid) => (room === undefined ? undefined : held.get(keyOf(room, msgid)));
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

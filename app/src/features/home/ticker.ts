// The ticker's items: the chain's trends first (7t), as the server ranks them, then the data's events still to come (the soonest), then its
// news (the newest), at most six. An event that has begun is news of the past, and one that waits for its date is not shown.
export interface TickerItem {
  id: string;
  kind: "trending" | "rising" | "new" | "news" | "event";
  text: string;
  link: string;
  /** Where a trend's data comes from and when, said on its link. */
  source?: string;
}
interface Row {
  id: string;
  title: string;
  link: string;
}
const MOST = 6;
// The data's start for an event whose date is to be confirmed: a sentinel at the end of 2099 (dataFiles.test.ts), never a date.
const UNDATED = Date.UTC(2099, 0, 1);

export function tickerItems(
  news: readonly (Row & { date: string })[],
  events: readonly (Row & { start: string })[],
  now: Date,
): TickerItem[] {
  const coming = events
    .filter((event) => Date.parse(event.start) > now.getTime() && Date.parse(event.start) < UNDATED)
    .toSorted((a, b) => Date.parse(a.start) - Date.parse(b.start))
    .map((event): TickerItem => ({ id: event.id, kind: "event", text: event.title, link: event.link }));
  const latest = news
    .toSorted((a, b) => b.date.localeCompare(a.date))
    .map((row): TickerItem => ({ id: row.id, kind: "news", text: row.title, link: row.link }));
  return [...coming, ...latest].slice(0, MOST);
}

/** The chain's trends before the data's items, as the server ranks them, six in all at most. */
export const ledByTrends = (trends: readonly TickerItem[], items: readonly TickerItem[]): TickerItem[] =>
  [...trends, ...items].slice(0, MOST);

// The ticker's items from the data's news and events: what is still to come first (the soonest), then the news (the newest), at
// most six. An event that has begun is news of the past, so it is dropped.
export interface TickerItem {
  id: string;
  kind: "news" | "event";
  text: string;
  link: string;
}
interface Row {
  id: string;
  title: string;
  link: string;
}
const MOST = 6;

export function tickerItems(
  news: readonly (Row & { date: string })[],
  events: readonly (Row & { start: string })[],
  now: Date,
): TickerItem[] {
  const coming = events
    .filter((event) => Date.parse(event.start) > now.getTime())
    .toSorted((a, b) => Date.parse(a.start) - Date.parse(b.start))
    .map((event): TickerItem => ({ id: event.id, kind: "event", text: event.title, link: event.link }));
  const latest = news
    .toSorted((a, b) => b.date.localeCompare(a.date))
    .map((row): TickerItem => ({ id: row.id, kind: "news", text: row.title, link: row.link }));
  return [...coming, ...latest].slice(0, MOST);
}

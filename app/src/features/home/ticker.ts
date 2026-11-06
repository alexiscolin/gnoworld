// The ticker's items: the chain's trends first (7t), as the server ranks them, then the calendar's coming events (the soonest), then what
// is on air (8i, frame 16's "ON AIR"), then its news (the newest), at most six. An event says its world and how soon, as frames 4 and 6's
// "Dev help · AMA · interrealm, with the core team in 11 h", and stays within its hour, "live now" (Alexis, 2026-11-05, changing 7t's rule
// that left live events out); one that waits for its date is not shown; an on-air line past its `until` is over.
import { comingEvents, comingIn, type CalendarEvent } from "../../lib/coming.ts";
export interface TickerItem {
  id: string;
  kind: "trending" | "rising" | "new" | "news" | "event" | "onair" | "chain";
  text: string;
  link: string;
  /** Where a trend's data comes from and when, said on its link. */
  source?: string;
  /** An event's own kind, said in place of its kind's word ("AMA", frame 6). */
  label?: string;
}
interface Row {
  id: string;
  title: string;
  link: string;
}
export const MOST = 6;

/** The ticker's events and news at `now`; an event's `place` is its world's name, none for a world the page does not list. */
export function tickerItems(
  news: readonly (Row & { date: string })[],
  events: readonly (CalendarEvent & { place?: string | undefined })[],
  now: Date,
): TickerItem[] {
  const coming = comingEvents(events, now.getTime()).map((event): TickerItem => {
    const { place } = event;
    const text = `${place === undefined ? "" : `${place} · `}${event.title} ${comingIn(event, now.getTime())}`;
    return {
      id: event.id,
      kind: "event",
      text,
      link: event.link,
      ...(event.kind === undefined ? {} : { label: event.kind }),
    };
  });
  const latest = news
    .toSorted((a, b) => b.date.localeCompare(a.date))
    .map((row): TickerItem => ({ id: row.id, kind: "news", text: row.title, link: row.link }));
  return [...coming, ...latest].slice(0, MOST);
}

/** What is on air now (8i), placed after the events `items` holds and before its news: a line past its `until` is over. */
export function withOnAir(
  items: readonly TickerItem[],
  onAir: readonly (Row & { until?: string | undefined })[],
  now: Date,
): TickerItem[] {
  const live = onAir
    .filter((row) => row.until === undefined || Date.parse(row.until) > now.getTime())
    .map((row): TickerItem => ({ id: row.id, kind: "onair", text: row.title, link: row.link }));
  const at = items.findLastIndex((item) => item.kind === "event") + 1;
  return [...items.slice(0, at), ...live, ...items.slice(at)].slice(0, MOST);
}

/** The chain's trends before the data's items, as the server ranks them, six in all at most. */
export const ledByTrends = (trends: readonly TickerItem[], items: readonly TickerItem[]): TickerItem[] =>
  [...trends, ...items].slice(0, MOST);

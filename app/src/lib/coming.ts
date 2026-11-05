// The data's events as what is coming (slice 8; 8p): dated, coming or live within the hour from their start, the soonest first, and how soon
// in the video's words. The calendar's agenda, the ticker and the labels' chips read them alike, apart from the calendar's own chunk.
import { UNDATED_EVENT } from "@gnoworld/schemas";

/** An event of the data file. */
export interface CalendarEvent {
  readonly id: string;
  readonly title: string;
  readonly start: string;
  readonly link: string;
  readonly world?: string | undefined;
  /** What it is in a word ("AMA"); unsaid, an event. */
  readonly kind?: string | undefined;
}

/** How long an event is live after its start: the data gives no end. */
export const LIVE_FOR_MS = 60 * 60 * 1000;
const HOUR_MS = 60 * 60 * 1000;

export const startOf = (event: CalendarEvent): number => Date.parse(event.start);

/** Whether the data dates `event`: one waiting for its date has the sentinel. */
export const isDated = (event: CalendarEvent): boolean => startOf(event) < UNDATED_EVENT;

/** The dated events coming or live at `now`, the soonest first, a tie by id. */
export const comingEvents = <Event extends CalendarEvent>(events: readonly Event[], now: number): Event[] =>
  events
    .filter((event) => isDated(event) && now < startOf(event) + LIVE_FOR_MS)
    .toSorted((a, b) => startOf(a) - startOf(b) || a.id.localeCompare(b.id));

/** How soon `event` starts, from `now`, in the video's words (frames 4, 6: "AMA in 11 h"): "live now" within its hour, else "in 40 min",
 * "in 11 h", "in 3 days"; a part of a unit counts one. */
export function comingIn(event: CalendarEvent, now: number): string {
  const ahead = startOf(event) - now;
  if (ahead <= 0) return "live now";
  if (ahead < HOUR_MS) return `in ${String(Math.ceil(ahead / 60_000))} min`;
  if (ahead < 48 * HOUR_MS) return `in ${String(Math.ceil(ahead / HOUR_MS))} h`;
  return `in ${String(Math.ceil(ahead / (24 * HOUR_MS)))} days`;
}

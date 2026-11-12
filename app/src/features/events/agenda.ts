// The calendar (ADR-0002 §1, Events and calendar; slice 8): the data's events as an agenda by day, in the reader's own time, the coming and
// the live ones (an hour from their start), those whose date waits for confirmation last. Pure: the clock is
// given.
import { comingEvents, isDated, LIVE_FOR_MS, startOf, type CalendarEvent } from "../../lib/coming.ts";

export { isDated, type CalendarEvent } from "../../lib/coming.ts";

/** Whether `event` is live at `now`: begun, and within its hour. */
export const isLive = (event: CalendarEvent, now: number): boolean =>
  isDated(event) && startOf(event) <= now && now < startOf(event) + LIVE_FOR_MS;

/** A day of the agenda: its first instant in the reader's time, and its events in their order. */
export interface AgendaDay<Event extends CalendarEvent = CalendarEvent> {
  readonly day: number;
  readonly events: readonly Event[];
}

/** The agenda at `now`: the dated events coming or live, by day in the reader's time, the soonest first; and the undated ones. In `world`
 * alone when one is named. */
export function agendaOf<Event extends CalendarEvent>(
  events: readonly Event[],
  now: number,
  world?: string,
): { days: AgendaDay<Event>[]; undated: Event[] } {
  const here = events.filter((event) => world === undefined || event.world === world);
  const dated = comingEvents(here, now);
  const days: AgendaDay<Event>[] = [];
  for (const event of dated) {
    const at = new Date(startOf(event));
    const day = new Date(at.getFullYear(), at.getMonth(), at.getDate()).getTime();
    const last = days.at(-1);
    if (last?.day === day) days[days.length - 1] = { day, events: [...last.events, event] };
    else days.push({ day, events: [event] });
  }
  return { days, undated: here.filter((event) => !isDated(event)) };
}

// The calendar (ADR-0002 §1, Events and calendar; slice 8): the data's events as an agenda by day, in the reader's own time, the coming and
// the live ones (an hour from their start), those whose date waits for confirmation last; and the reminders' window. Pure: the clock is
// given.
import { UNDATED_EVENT } from "@gnoworld/schemas";

/** An event of the data file. */
export interface CalendarEvent {
  readonly id: string;
  readonly title: string;
  readonly start: string;
  readonly link: string;
  readonly world?: string | undefined;
}

/** How long an event is live after its start: the data gives no end. */
const LIVE_FOR_MS = 60 * 60 * 1000;
/** How long before its start a reminder fires. */
const REMIND_BEFORE_MS = 10 * 60 * 1000;
/** The farthest a reminder's timer is armed: past it, the page arms it again when it opens (a timer past 2^31 ms fires at once). */
const REMIND_WINDOW_MS = 24 * 60 * 60 * 1000;

const startOf = (event: CalendarEvent) => Date.parse(event.start);

/** Whether the data dates `event`: one waiting for its date has the sentinel. */
export const isDated = (event: CalendarEvent): boolean => startOf(event) < UNDATED_EVENT;

/** Whether `event` is live at `now`: begun, and within its hour. */
export const isLive = (event: CalendarEvent, now: number): boolean =>
  isDated(event) && startOf(event) <= now && now < startOf(event) + LIVE_FOR_MS;

/** A day of the agenda: its first instant in the reader's time, and its events in their order. */
export interface AgendaDay {
  readonly day: number;
  readonly events: readonly CalendarEvent[];
}

/** The agenda at `now`: the dated events coming or live, by day in the reader's time, the soonest first; and the undated ones. In `world`
 * alone when one is named. */
export function agendaOf(
  events: readonly CalendarEvent[],
  now: number,
  world?: string,
): { days: AgendaDay[]; undated: CalendarEvent[] } {
  const here = events.filter((event) => world === undefined || event.world === world);
  const dated = here
    .filter((event) => isDated(event) && now < startOf(event) + LIVE_FOR_MS)
    .toSorted((a, b) => startOf(a) - startOf(b) || a.id.localeCompare(b.id));
  const days: AgendaDay[] = [];
  for (const event of dated) {
    const at = new Date(startOf(event));
    const day = new Date(at.getFullYear(), at.getMonth(), at.getDate()).getTime();
    const last = days.at(-1);
    if (last?.day === day) days[days.length - 1] = { day, events: [...last.events, event] };
    else days.push({ day, events: [event] });
  }
  return { days, undated: here.filter((event) => !isDated(event)) };
}

/** What the reminders asked come to at `now`: those to tell now (their time came, the event not over), those whose event is over unasked
 * (never told after a gap), and the next to arm within the window, if any. */
export function remindersAt(
  events: readonly CalendarEvent[],
  reminders: Readonly<Record<string, { readonly fired: boolean }>>,
  now: number,
): { due: CalendarEvent[]; over: CalendarEvent[]; next: number | undefined } {
  const asked = events.filter((event) => isDated(event) && reminders[event.id]?.fired === false);
  const due = asked.filter((event) => startOf(event) - REMIND_BEFORE_MS <= now && now < startOf(event) + LIVE_FOR_MS);
  const over = asked.filter((event) => now >= startOf(event) + LIVE_FOR_MS);
  const coming = asked
    .map((event) => startOf(event) - REMIND_BEFORE_MS)
    .filter((at) => at > now && at - now <= REMIND_WINDOW_MS);
  return { due, over, next: coming.length === 0 ? undefined : Math.min(...coming) };
}

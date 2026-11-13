// An event's time (ADR-0002 §1, Events and calendar): whether it is dated, and live, an hour from its start. Pure: the clock is given.
import { isDated, LIVE_FOR_MS, startOf, type CalendarEvent } from "../../lib/coming.ts";

export { isDated, type CalendarEvent } from "../../lib/coming.ts";

/** Whether `event` is live at `now`: begun, and within its hour. */
export const isLive = (event: CalendarEvent, now: number): boolean =>
  isDated(event) && startOf(event) <= now && now < startOf(event) + LIVE_FOR_MS;

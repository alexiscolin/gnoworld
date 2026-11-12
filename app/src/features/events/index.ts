// Events and calendar (ADR-0002 §1; slice 8): the data's events as an agenda. The calendar's dialog is a
// chunk of its own, asked when it opens: the bell's count, which reads the rest, stays light.
export { isLive, type CalendarEvent } from "./agenda.ts";
export { placeOf, universeAt } from "./places.ts";

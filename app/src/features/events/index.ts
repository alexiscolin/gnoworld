// Events and calendar (ADR-0002 §1; slice 8): the data's events as an agenda, and reminders on this device. The calendar's dialog is a
// chunk of its own, asked when it opens: the bell's count and reminders, which read the rest, stay light.
export { isLive, remindersAt, type CalendarEvent } from "./agenda.ts";
export { placeOf, universeAt } from "./places.ts";
/** The calendar's dialog, for React's lazy: its chunk asked when it first opens. */
export const calendar = async () => ({ default: (await import("./Calendar.tsx")).Calendar });

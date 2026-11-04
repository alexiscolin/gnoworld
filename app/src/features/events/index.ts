// Events and calendar (ADR-0002 §1; slice 8): the data's events as an agenda, and reminders on this device. The calendar's dialog is a
// chunk of its own, asked when it opens: the bell's count and reminders, which read the rest, stay light.
import { lazy } from "react";

export { isLive, remindersAt, type CalendarEvent } from "./agenda.ts";
export { placeOf, universeAt } from "./places.ts";
export const Calendar = lazy(async () => ({ default: (await import("./Calendar.tsx")).Calendar }));

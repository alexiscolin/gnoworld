// The data's events: dated or waiting for their date, and live within the hour from their start.
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

export const startOf = (event: CalendarEvent): number => Date.parse(event.start);

/** Whether the data dates `event`: one waiting for its date has the sentinel. */
export const isDated = (event: CalendarEvent): boolean => startOf(event) < UNDATED_EVENT;

import { UNDATED_EVENT } from "@gnoworld/schemas";
import { describe, expect, it } from "vitest";
import { isDated, isLive, type CalendarEvent } from "./agenda.ts";

// An event's time: dated before the data's sentinel, live for an hour from its start.
const HOUR = 3_600_000;
const event = (id: string, start: string | number, world?: string): CalendarEvent => ({
  id,
  title: `Event ${id}`,
  start: typeof start === "number" ? new Date(start).toISOString() : start,
  link: "https://example.com/e",
  ...(world === undefined ? {} : { world }),
});
const UNDATED = new Date(UNDATED_EVENT).toISOString();

describe("an event's time", () => {
  const now = Date.parse("2026-11-05T12:00:00.000Z");

  it("is undated at the data's sentinel, dated before it", () => {
    expect(isDated(event("a", UNDATED))).toBe(false);
    expect(isDated(event("a", UNDATED_EVENT - 1))).toBe(true);
  });

  it("is live from its start for one hour, never before nor at the hour's end", () => {
    expect(isLive(event("a", now), now)).toBe(true);
    expect(isLive(event("a", now - HOUR + 1), now)).toBe(true);
    expect(isLive(event("a", now - HOUR), now)).toBe(false);
    expect(isLive(event("a", now + 1), now)).toBe(false);
    expect(isLive(event("a", UNDATED), UNDATED_EVENT + 1)).toBe(false);
  });
});

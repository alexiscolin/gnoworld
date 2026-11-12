import { UNDATED_EVENT } from "@gnoworld/schemas";
import { describe, expect, it } from "vitest";
import { agendaOf, isDated, isLive, type CalendarEvent } from "./agenda.ts";

// The calendar: the agenda by the reader's local day, live for an hour, undated last.
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

describe("the agenda", () => {
  // Built in the reader's own zone, whatever it is where the tests run: the agenda's days are the reader's.
  const local = (day: number, [hour, minute = 0, second = 0]: readonly number[]) =>
    new Date(2026, 10, day, hour, minute, second).getTime();

  it("groups the coming and live events by the reader's local day, the soonest first, and puts the undated apart", () => {
    const now = local(5, [12]);
    const got = agendaOf(
      [
        event("late", local(6, [0])),
        event("past", local(5, [10])),
        event("live", local(5, [11, 30])),
        event("eve", local(5, [23, 59, 59])),
        event("soon", UNDATED),
      ],
      now,
    );
    expect(got.days.map(({ events }) => events.map(({ id }) => id))).toEqual([["live", "eve"], ["late"]]);
    expect(got.days.map(({ day }) => day)).toEqual([local(5, [0]), local(6, [0])]);
    expect(got.undated.map(({ id }) => id)).toEqual(["soon"]);
  });

  it("keeps a local day whole however long it is: 2026-10-25 has 25 hours where clocks go back", () => {
    const at = (day: number, hour: number, minute: number) => new Date(2026, 9, day, hour, minute).getTime();
    const got = agendaOf(
      [event("a", at(25, 0, 30)), event("b", at(25, 23, 30)), event("c", at(26, 0, 30))],
      at(24, 12, 0),
    );
    expect(got.days.map(({ events }) => events.map(({ id }) => id))).toEqual([["a", "b"], ["c"]]);
  });

  it("drops an event the moment its live hour ends", () => {
    const now = Date.parse("2026-11-05T12:00:00.000Z");
    expect(agendaOf([event("ended", now - HOUR)], now).days).toEqual([]);
    expect(agendaOf([event("last", now - HOUR + 1)], now).days).toHaveLength(1);
  });

  it("orders two events at one time by their id", () => {
    const now = Date.parse("2026-11-05T12:00:00.000Z");
    const got = agendaOf([event("b", now + HOUR), event("a", now + HOUR)], now);
    expect(got.days[0]?.events.map(({ id }) => id)).toEqual(["a", "b"]);
  });

  it("holds one world's events alone when a world is named, the undated among them", () => {
    const now = Date.parse("2026-11-05T12:00:00.000Z");
    const all = [
      event("here", now + HOUR, "gnoswap"),
      event("there", now + HOUR, "memba"),
      event("u", UNDATED, "gnoswap"),
    ];
    const got = agendaOf(all, now, "gnoswap");
    expect(got.days.flatMap(({ events }) => events.map(({ id }) => id))).toEqual(["here"]);
    expect(got.undated.map(({ id }) => id)).toEqual(["u"]);
    expect(agendaOf(all, now).days.flatMap(({ events }) => events)).toHaveLength(2);
  });
});

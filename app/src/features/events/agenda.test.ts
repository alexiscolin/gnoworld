import { UNDATED_EVENT } from "@gnoworld/schemas";
import { describe, expect, it } from "vitest";
import { agendaOf, isDated, isLive, remindersAt, type CalendarEvent } from "./agenda.ts";

// The calendar and the reminders' window (slice 8; the plan's threat model, "The clock" and "Reminder timers"): the agenda by the
// reader's local day, live for an hour, undated last; a reminder told once, ten minutes before, never for an event over after a gap, and
// its timer armed only within a day (a timer past 2^31 ms fires at once; the sample events sit in 2099).
const HOUR = 3_600_000;
const MINUTE = 60_000;
const DAY = 24 * HOUR;
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

describe("the reminders' window", () => {
  const now = Date.parse("2026-11-05T12:00:00.000Z");

  it("tells a reminder ten minutes before its event, and not a minute sooner", () => {
    const soon = event("a", now + 10 * MINUTE);
    // Told now, so no timer is armed for it: a timer of 0 ms would tell it again.
    expect(remindersAt([soon], { a: { fired: false } }, now)).toEqual({ due: [soon], over: [], next: undefined });
    const later = event("a", now + 10 * MINUTE + 1);
    const got = remindersAt([later], { a: { fired: false } }, now);
    expect(got.due).toEqual([]);
    expect(got.next).toBe(now + 1);
  });

  it("tells a reminder while its event is live, at the next open", () => {
    const live = event("a", now - 30 * MINUTE);
    expect(remindersAt([live], { a: { fired: false } }, now)).toEqual({ due: [live], over: [], next: undefined });
  });

  it("never tells a reminder after its event is over (a gap): it is over, to mark", () => {
    const gone = event("a", now - HOUR);
    expect(remindersAt([gone], { a: { fired: false } }, now)).toEqual({ due: [], over: [gone], next: undefined });
  });

  it("tells a reminder once: a fired one and an event not asked are left alone", () => {
    const soon = event("a", now + 5 * MINUTE);
    const other = event("b", now + 5 * MINUTE);
    expect(remindersAt([soon, other], { a: { fired: true } }, now)).toEqual({ due: [], over: [], next: undefined });
  });

  it("arms the nearest reminder within a day, one timer", () => {
    const got = remindersAt(
      [event("far", now + 20 * HOUR), event("near", now + 2 * HOUR), event("next", now + 30 * HOUR)],
      { far: { fired: false }, near: { fired: false }, next: { fired: false } },
      now,
    );
    expect(got.next).toBe(now + 2 * HOUR - 10 * MINUTE);
  });

  it("arms a reminder exactly a day ahead, and none a millisecond past", () => {
    expect(remindersAt([event("a", now + DAY + 10 * MINUTE)], { a: { fired: false } }, now).next).toBe(now + DAY);
    expect(remindersAt([event("a", now + DAY + 10 * MINUTE + 1)], { a: { fired: false } }, now).next).toBeUndefined();
  });

  it("arms nothing and tells nothing for an event 40 days ahead, or an undated one", () => {
    const far = remindersAt(
      [event("far", now + 40 * DAY), event("u", UNDATED)],
      { far: { fired: false }, u: { fired: false } },
      now,
    );
    expect(far).toEqual({ due: [], over: [], next: undefined });
  });

  it("fires nothing for every reminder at once when the clock jumps a year forward: all are over", () => {
    const events = [event("a", now + HOUR), event("b", now + 2 * HOUR)];
    const asked = { a: { fired: false }, b: { fired: false } };
    const got = remindersAt(events, asked, now + 365 * DAY);
    expect(got.due).toEqual([]);
    expect(got.over.map(({ id }) => id)).toEqual(["a", "b"]);
  });

  it("tells nothing when the clock is set back before the window", () => {
    expect(remindersAt([event("a", now + HOUR)], { a: { fired: false } }, now - 30 * DAY)).toEqual({
      due: [],
      over: [],
      next: undefined,
    });
  });
});

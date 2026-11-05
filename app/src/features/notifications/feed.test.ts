import type { Notice } from "@gnoworld/core";
import { describe, expect, it } from "vitest";
import type { CalendarEvent } from "../events/index.ts";
import { feedOf, isUnread, whenOf, type Naming, type Sources } from "./feed.ts";

// The bell's list (slice 8; frames 86, 87): the account's notices (Messages), the coming day's events and the followed worlds where people
// are (Worlds), the team's news for 14 days (News); each unread until marked, or until a "Mark all read" past its time.
const NOW = Date.parse("2026-11-05T12:00:00.000Z");
const HOUR = 3_600_000;
const DAY = 24 * HOUR;

const notice = (id: string, time: number, kind: Notice["kind"] = "mention"): Notice => ({
  id,
  kind,
  time: new Date(time).toISOString(),
  where: "#bubble",
  by: "noor",
});
const event = (id: string, start: number, world?: string): CalendarEvent => ({
  id,
  title: `Event ${id}`,
  start: new Date(start).toISOString(),
  link: "https://gno.land/e",
  ...(world === undefined ? {} : { world }),
});
const naming: Naming = {
  notice: () => ({ text: "noor mentioned you", where: "#bubble", world: "bubble", href: "/w/bubble" }),
  place: (world) => (world === "bubble" ? { name: "Bubble", href: "/w/bubble" } : undefined),
  live: (one, now) => Date.parse(one.start) <= now && now < Date.parse(one.start) + HOUR,
};
const sources = (over: Partial<Sources> = {}): Sources => ({
  notices: [],
  events: [],
  news: [],
  here: new Map(),
  followed: [],
  ...over,
});
const ids = (over: Partial<Sources>, now = NOW) => feedOf(sources(over), naming, now).map(({ id }) => id);

describe("the bell's lines", () => {
  it("are the notices, the events and the news, the newest first", () => {
    const got = feedOf(
      sources({
        notices: [notice("n1", NOW - 2 * HOUR), notice("n2", NOW - 10 * 60_000, "dm")],
        events: [event("e1", NOW + 3 * HOUR, "bubble")],
        news: [{ id: "w1", title: "News", date: "2026-11-04", link: "https://gno.land/news" }],
      }),
      naming,
      NOW,
    );
    expect(got.map(({ id }) => id)).toEqual(["event:e1", "notice:n2", "notice:n1", "news:w1"]);
    expect(got.map(({ kind }) => kind)).toEqual(["worlds", "messages", "messages", "news"]);
    expect(got.find(({ id }) => id === "notice:n2")?.icon).toBe("mail");
  });

  it("hold an event within the coming day or live, never past nor further ahead", () => {
    const events = [
      event("soon", NOW + DAY),
      event("far", NOW + DAY + 1),
      event("live", NOW - 30 * 60_000),
      event("over", NOW - HOUR),
    ];
    expect(ids({ events })).toEqual(["event:soon", "event:live"]);
    const live = feedOf(sources({ events }), naming, NOW).find(({ id }) => id === "event:live");
    expect(live?.text).toBe("Event live: live now");
  });

  it("send an event in a world to its page, and one online off the site, through the warning", () => {
    const got = feedOf(
      sources({ events: [event("here", NOW + HOUR, "bubble"), event("online", NOW + 2 * HOUR)] }),
      naming,
      NOW,
    );
    expect(got.find(({ id }) => id === "event:here")).toMatchObject({
      where: "Bubble",
      href: "/w/bubble",
      external: false,
    });
    expect(got.find(({ id }) => id === "event:online")).toMatchObject({
      where: "Online",
      href: "https://gno.land/e",
      external: true,
    });
  });

  it("drop the news older than 14 days", () => {
    const news = [
      { id: "fresh", title: "A", date: "2026-10-22", link: "https://gno.land/a" },
      { id: "old", title: "B", date: "2026-10-21", link: "https://gno.land/b" },
    ];
    expect(ids({ news }, Date.parse("2026-11-05T00:00:00.000Z"))).toEqual(["news:fresh"]);
  });

  it("put first the followed worlds where people are now, none where nobody is or the page lists no such world", () => {
    const got = feedOf(
      sources({
        notices: [notice("n1", NOW)],
        followed: ["bubble", "empty", "gone"],
        here: new Map([
          ["bubble", 4],
          ["empty", 0],
          ["gone", 9],
        ]),
      }),
      naming,
      NOW,
    );
    expect(got.map(({ id }) => id)).toEqual(["here:bubble", "notice:n1"]);
    expect(got[0]?.text).toBe("Bubble, a world you follow: 4 here now");
  });
});

describe("a line read", () => {
  const item = (at: number, id = "notice:n1") => ({
    id,
    kind: "messages" as const,
    icon: "at" as const,
    text: "",
    where: "",
    at,
    href: "/",
  });

  it("is unread until marked by its id", () => {
    expect(isUnread(item(NOW), { through: null, ids: [] })).toBe(true);
    expect(isUnread(item(NOW), { through: null, ids: ["notice:n1"] })).toBe(false);
  });

  it("is read when it came at or before the last Mark all read", () => {
    const through = new Date(NOW).toISOString();
    expect(isUnread(item(NOW), { through, ids: [] })).toBe(false);
    expect(isUnread(item(NOW + 1), { through, ids: [] })).toBe(true);
  });
});

describe("a line's time", () => {
  it("says NOW, minutes, hours, days, or SOON for what is ahead", () => {
    expect(whenOf(Number.NaN, NOW)).toBe("NOW");
    expect(whenOf(NOW + 1, NOW)).toBe("SOON");
    expect(whenOf(NOW - 59_999, NOW)).toBe("NOW");
    expect(whenOf(NOW - 60_000, NOW)).toBe("1 MIN");
    expect(whenOf(NOW - 59 * 60_000, NOW)).toBe("59 MIN");
    expect(whenOf(NOW - HOUR, NOW)).toBe("1 H");
    expect(whenOf(NOW - 23 * HOUR - 59 * 60_000, NOW)).toBe("23 H");
    expect(whenOf(NOW - DAY, NOW)).toBe("1 D");
    expect(whenOf(NOW - 3 * DAY, NOW)).toBe("3 D");
  });
});

import { PRESENCE_HOURS, PresenceHours } from "@gnoworld/schemas/indexer";
import { Hono } from "hono";
import { describe, expect, it, vi } from "vitest";
import { hoursOf, hoursRoute } from "./hours.ts";

// A world's last day of messages an hour (8g), as a plate reads it: counts alone, 24 hours, an hour no sample read null.
const HOUR = 3_600_000;
const AT = Date.parse("2026-11-04T10:25:00.000Z");
const THIS_HOUR = Math.floor(AT / HOUR) * HOUR;
const FROM = THIS_HOUR - (PRESENCE_HOURS - 1) * HOUR;

describe("a world's hours", () => {
  it("gives 24 hours from the hour 23 back to the current one, nulls where no sample was kept", () => {
    const answer = hoursOf(
      [
        { at: THIS_HOUR, people: 7 },
        { at: FROM, people: 3 },
        { at: THIS_HOUR - 5 * HOUR, people: 0 },
      ],
      9,
      AT,
    );
    expect(answer.from).toBe(FROM);
    expect(answer.hours).toHaveLength(PRESENCE_HOURS);
    expect(answer.hours.at(0)).toBe(3);
    expect(answer.hours.at(-1)).toBe(7);
    expect(answer.hours.at(-6)).toBe(0);
    expect(answer.hours.filter((hour) => hour === null)).toHaveLength(PRESENCE_HOURS - 3);
    expect(answer.now).toBe(9);
    expect(PresenceHours.safeParse(answer).success).toBe(true);
  });

  it("leaves out a sample older than the day, or of an hour to come", () => {
    const answer = hoursOf(
      [
        { at: FROM - HOUR, people: 4 },
        { at: THIS_HOUR + HOUR, people: 5 },
        { at: THIS_HOUR, people: 1 },
      ],
      null,
      AT,
    );
    expect(answer.hours.filter((hour) => hour !== null)).toEqual([1]);
    expect(answer.now).toBeNull();
  });

  it("gives no hours for a world with no sample, but still its pace now", () => {
    expect(hoursOf([], 2, AT)).toEqual({ from: FROM, hours: [], now: 2 });
    expect(hoursOf([{ at: FROM - HOUR, people: 4 }], 2, AT).hours).toEqual([]);
  });
});

describe("GET /hours", () => {
  const ask = async (query: string, hours = vi.fn(() => hoursOf([{ at: THIS_HOUR, people: 2 }], 1, AT))) => {
    const routes = new Hono();
    hoursRoute(routes, hours);
    const response = await routes.request(`/hours${query}`);
    return { response, hours };
  };

  it("answers a world's hours, public and kept a minute by any cache", async () => {
    const { response, hours } = await ask("?world=earth");
    expect(response.status).toBe(200);
    expect(response.headers.get("cache-control")).toBe("public, max-age=60");
    expect(hours).toHaveBeenCalledWith("earth");
    expect(PresenceHours.parse(await response.json()).hours.at(-1)).toBe(2);
  });

  it("refuses a name that is no world's slug, without asking for any hours", async () => {
    const bad = [
      "",
      "?world=",
      "?world=Earth",
      "?world=../x",
      "?world=a%20b",
      "?world=-a",
      "?world=a--b",
      `?world=${"a".repeat(65)}`,
    ];
    for (const query of bad) {
      const { response, hours } = await ask(query);
      expect(response.status, query).toBe(400);
      expect(await response.json()).toEqual({ error: "refused" });
      expect(response.headers.get("cache-control"), query).toBeNull();
      expect(hours).not.toHaveBeenCalled();
    }
  });

  it("takes a name of 64 characters, the longest a slug may be", async () => {
    expect((await ask(`?world=${"a".repeat(64)}`)).response.status).toBe(200);
  });
});

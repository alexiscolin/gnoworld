import type { DatabaseSync } from "node:sqlite";
import { ActivityRooms } from "@gnoworld/schemas";
import { afterEach, describe, expect, it } from "vitest";
import { makeApp } from "../app.ts";
import { openDatabase } from "../db.ts";
import { logger } from "../log.ts";
import { ensureRooms, ROOM_TABLES } from "../rooms/rooms.ts";
import { makeActivity } from "./activity.ts";
import { activityRoutes } from "./routes.ts";

const T0 = Date.parse("2026-10-22T12:00:00.000Z");
const REFUSED = JSON.stringify({ error: "refused" });
const opened: DatabaseSync[] = [];
afterEach(() => {
  for (const db of opened.splice(0)) db.close();
});

const setup = () => {
  const db = openDatabase(":memory:", [ROOM_TABLES]);
  opened.push(db);
  ensureRooms(db, ["earth", "bubble"], T0);
  const activity = makeActivity();
  const app = makeApp(
    logger("a-pepper-of-forty-characters-0123456789", () => true),
    () => true,
  );
  app.route("/api/activity", activityRoutes(activity, { db, now: () => T0 }));
  const ask = async (query: string) => {
    const response = await app.request(`/api/activity${query}`);
    return [response.status, await response.text(), response.headers.get("cache-control")];
  };
  return { db, activity, ask };
};

describe("GET /api/activity", () => {
  it("answers in the shape its clients parse", async () => {
    const { activity, ask } = setup();
    activity.count("#bubble", "a", T0);
    const [, body] = await ask("?worlds=bubble");
    expect(ActivityRooms.parse(JSON.parse(String(body)))).toEqual({
      rooms: [{ world: "bubble", room: "#bubble", perMinute: 0.2 }],
    });
  });

  it("answers each asked world's rooms with their messages a minute, public and kept 5 seconds", async () => {
    const { activity, ask } = setup();
    activity.count("#bubble", "a", T0);
    activity.count("#bubble", "b", T0);
    expect(await ask("?worlds=bubble,earth")).toEqual([
      200,
      JSON.stringify({
        rooms: [
          { world: "bubble", room: "#bubble", perMinute: 0.4 },
          { world: "earth", room: "#earth", perMinute: 0 },
        ],
      }),
      "public, max-age=5",
    ]);
  });

  it("answers only for the worlds asked: an unknown one is absent, not an error", async () => {
    const { ask } = setup();
    expect(await ask("?worlds=nowhere,bubble")).toEqual([
      200,
      JSON.stringify({ rooms: [{ world: "bubble", room: "#bubble", perMinute: 0 }] }),
      "public, max-age=5",
    ]);
    expect((await ask("?worlds=nowhere"))[1]).toBe(JSON.stringify({ rooms: [] }));
  });

  it("answers a room made after the start", async () => {
    const { db, ask } = setup();
    ensureRooms(db, ["moon"], T0);
    expect((await ask("?worlds=moon"))[1]).toBe(
      JSON.stringify({ rooms: [{ world: "moon", room: "#moon", perMinute: 0 }] }),
    );
  });

  it("takes 25 worlds and refuses the 26th", async () => {
    const { ask } = setup();
    const worlds = Array.from({ length: 26 }, (_, n) => `w${String(n)}`);
    expect((await ask(`?worlds=${worlds.slice(0, 25).join(",")}`))[0]).toBe(200);
    expect((await ask(`?worlds=${worlds.join(",")}`)).slice(0, 2)).toEqual([400, REFUSED]);
  });

  it.each([
    ["no worlds", ""],
    ["an empty list", "?worlds="],
    ["an empty name", "?worlds=bubble,"],
    ["a name in capitals", "?worlds=Bubble"],
    ["a name with a slash", "?worlds=a%2Fb"],
    ["a room's name", "?worlds=%23bubble"],
    ["the list twice", "?worlds=bubble&worlds=earth"],
    ["a name that starts with a hyphen", "?worlds=-a"],
    ["a name that ends with one", "?worlds=a-"],
    ["two hyphens in a row", "?worlds=a--b"],
    ["a space after a comma", "?worlds=bubble,%20earth"],
    ["a NUL", "?worlds=bub%00ble"],
    ["a name of 65 characters", `?worlds=${"a".repeat(65)}`],
  ])("refuses %s, with the login's one answer, kept by no cache", async (_, query) => {
    const { ask } = setup();
    const [status, body, cache] = await ask(query);
    expect([status, body]).toEqual([400, REFUSED]);
    expect(String(cache)).not.toMatch(/public|max-age/);
  });

  it("takes a name of 64 characters, and a world asked twice answers once", async () => {
    const { db, ask } = setup();
    ensureRooms(db, ["a".repeat(64)], T0);
    expect((await ask(`?worlds=${"a".repeat(64)}`))[1]).toBe(
      JSON.stringify({ rooms: [{ world: "a".repeat(64), room: `#${"a".repeat(64)}`, perMinute: 0 }] }),
    );
    expect((await ask("?worlds=bubble,bubble"))[1]).toBe(
      JSON.stringify({ rooms: [{ world: "bubble", room: "#bubble", perMinute: 0 }] }),
    );
  });
});

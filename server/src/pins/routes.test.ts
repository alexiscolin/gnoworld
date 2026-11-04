import { Address, PinList } from "@gnoworld/schemas";
import { describe, expect, it } from "vitest";
import { BODY_LIMIT, makeApp } from "../app.ts";
import { logger } from "@gnoworld/service/log";
import { pinsRoutes } from "./routes.ts";
import type { Pins } from "./pins.ts";

// Slice 4's 4d: GET /api/pins, POST /api/pins and POST /api/pins/unpin (docs/plans/slice-4.md §3's threat model, §7). Who reads follows the
// room's own rule (as /api/rooms and the stream), who pins is the room's world's moderators and the team, checked
// before any work, and what is pinned is the line Ergo holds, named by its id alone.
const ORIGIN = "https://gnoworld.test";
const T0 = Date.parse("2026-10-27T09:00:00.000Z");
const MINUTE = 60_000;
const ALICE = Address.parse("g10gh7yq7swv77efwfcqy2znp37cmeughxx3y5tv");
const MOD = Address.parse("g1m68zzc430znqyxzv6jsfz45hgccacx3mk6qajw");
const OTHER_MOD = Address.parse("g1zgldsmn6ck6w4p325xd3j8y779ky6fpjnz3uh9");
const TEAM = Address.parse("g1jg8mtutu9khhfwc4nxmuhcpftf0pajdhfvsqf5");
const TOKENS = new Map([
  ["mod", MOD],
  ["team", TEAM],
  ["other", OTHER_MOD],
  ["alice", ALICE],
]);
// #bubble's moderator and the team pin in #bubble's rooms alone; #bubble/crew is its members', ALICE one of them.
const STAFF: string[] = [MOD, TEAM];
const mayPin = (room: string, who: string): boolean => STAFF.includes(who) && room.startsWith("#bubble");
const readable = (room: string, who: string | undefined): boolean => room !== "#bubble/crew" || who === ALICE;
const pin = (id: string) => ({ id, time: "2026-10-25T10:00:00.000Z", account: ALICE, text: `text ${id}` });

// A set of pins in memory, answering as the real one does, and what the routes asked of it.
function setup({
  answer = "pinned",
  breaks,
}: {
  answer?: "pinned" | "already" | "not_found" | "full" | "refused" | "unavailable";
  breaks?: "list" | "add";
} = {}) {
  const held = new Map<string, ReturnType<typeof pin>[]>([["#bubble/games", [pin("m1")]]]);
  const calls: string[] = [];
  const pins: Pins = {
    list: (room) => {
      if (breaks === "list") throw new Error("the database said: secret text of a pin");
      return held.get(room) ?? [];
    },
    add: (room, msgid, by) => {
      calls.push(`add ${room} ${msgid} ${by}`);
      if (breaks === "add") return Promise.reject(new Error("the database said: secret text of a pin"));
      if (answer === "pinned") held.set(room, [pin(msgid), ...(held.get(room) ?? [])]);
      return Promise.resolve(answer);
    },
    remove: (room, msgid) => {
      calls.push(`remove ${room} ${msgid}`);
      const before = held.get(room) ?? [];
      held.set(
        room,
        before.filter(({ id }) => id !== msgid),
      );
      return (held.get(room) ?? []).length < before.length;
    },
    drop: () => undefined,
    edited: () => undefined,
    check: () => Promise.resolve(),
  };
  const lines: string[] = [];
  const log = logger("a-pepper-of-forty-characters-0123456789", (line) => lines.push(line));
  const clock = { now: T0 };
  const app = makeApp(log, () => true);
  app.route(
    "/api/pins",
    pinsRoutes({
      pins,
      mayPin,
      readable,
      session: (token) => TOKENS.get(token ?? ""),
      origins: [ORIGIN],
      log,
      now: () => clock.now,
    }),
  );
  interface Ask {
    who?: string;
    origin?: string | null;
    type?: string | null;
    body?: unknown;
  }
  const ask = (method: string, query: string, { who, origin = ORIGIN, type = "application/json", body }: Ask = {}) =>
    app.request(
      `/api/pins${query}`,
      {
        method,
        headers: {
          ...(origin === null ? {} : { origin }),
          ...(type === null || method === "GET" ? {} : { "content-type": type }),
          ...(who === undefined ? {} : { cookie: `__Host-session=${who}` }),
        },
        ...(body === undefined ? {} : { body: typeof body === "string" ? body : JSON.stringify(body) }),
      },
      { incoming: { socket: { remoteAddress: "203.0.113.7" } } },
    );
  const room = (id: string) => `?room=${encodeURIComponent(id)}`;
  return {
    calls,
    clock,
    ask,
    room,
    get: (id: string, who?: string) => ask("GET", room(id), { ...(who === undefined ? {} : { who }) }),
    pin: (body: unknown, more: Ask = {}) => ask("POST", "", { body, ...more }),
    unpin: (id: string, msgid: string, more: Ask = {}) => ask("POST", "/unpin", { body: { room: id, msgid }, ...more }),
    events: () => lines.map((line) => line.replace(/^\{"time":"[^"]+",/, "{")),
  };
}
const body = async (response: Response) => PinList.parse(await response.json());

describe("reading a room's pins", () => {
  it("lists them to a guest in a room anyone reads, saying the guest may not pin, answers never cached", async () => {
    const response = await setup().get("#bubble/games");
    expect(response.status).toBe(200);
    expect(response.headers.get("cache-control")).toBe("no-store");
    expect(await body(response)).toEqual({ room: "#bubble/games", may: false, pins: [pin("m1")] });
  });

  it("says the room's moderator may pin, another world's moderator and a reader may not", async () => {
    const t = setup();
    expect((await body(await t.get("#bubble/games", "mod"))).may).toBe(true);
    expect((await body(await t.get("#bubble/games", "other"))).may).toBe(false);
    expect((await body(await t.get("#bubble/games", "alice"))).may).toBe(false);
    expect((await body(await t.get("#earth", "mod"))).may).toBe(false);
  });

  it("answers a room nobody pinned in with none, and a room it may not show to this reader with forbidden", async () => {
    const t = setup();
    expect(await body(await t.get("#bubble/news"))).toEqual({ room: "#bubble/news", may: false, pins: [] });
    for (const who of [undefined, "other", "mod"]) {
      const response = await t.get("#bubble/crew", who);
      expect([response.status, await response.json()]).toEqual([403, { error: "forbidden" }]);
    }
    expect((await t.get("#bubble/crew", "alice")).status).toBe(200);
  });

  it.each([
    ["no room", ""],
    ["a room that is no room's", "?room=bubble"],
    ["a room twice", "?room=%23bubble&room=%23bubble%2Fcrew"],
    ["a room of a space", "?room=%23bub%20ble"],
    ["a room past Ergo's 64 characters", `?room=%23${"a".repeat(64)}`],
  ])("refuses %s", async (_, query) => {
    const response = await setup().ask("GET", query);
    expect([response.status, await response.json()]).toEqual([400, { error: "refused" }]);
  });
});

describe("pinning a line", () => {
  it("lets the room's moderator pin a line by its id, and answers the room's pins as they now are", async () => {
    const t = setup();
    const response = await t.pin({ room: "#bubble/games", msgid: "m2" }, { who: "mod" });
    expect(response.status).toBe(200);
    expect((await body(response)).pins.map(({ id }) => id)).toEqual(["m2", "m1"]);
    expect(t.calls).toEqual([`add #bubble/games m2 ${MOD}`]);
    expect(t.events()).toContainEqual(expect.stringContaining('"pin_added"'));
  });

  it("says so, with the pins, when the line was pinned already", async () => {
    const t = setup({ answer: "already" });
    const response = await t.pin({ room: "#bubble/games", msgid: "m1" }, { who: "mod" });
    expect(response.status).toBe(200);
    expect((await body(response)).pins.map(({ id }) => id)).toEqual(["m1"]);
  });

  // The order of the checks: the guard, the session, the body, the right, the limit; only then Ergo is asked.
  it.each([
    ["an Origin not listed", { who: "mod", origin: "https://evil.test" }, [403, "forbidden"]],
    ["no Origin", { who: "mod", origin: null }, [403, "forbidden"]],
    ["a body that is not JSON", { who: "mod", type: "text/plain" }, [415, "unsupported"]],
    ["no session", {}, [401, "unauthenticated"]],
    ["a reader who moderates nothing", { who: "alice" }, [403, "forbidden"]],
    ["another world's moderator", { who: "other" }, [403, "forbidden"]],
  ])("refuses %s before it asks Ergo anything", async (_, more, [status, error]) => {
    const t = setup();
    const response = await t.pin({ room: "#bubble/games", msgid: "m2" }, more);
    expect([response.status, await response.json()]).toEqual([status, { error }]);
    expect(t.calls).toEqual([]);
    expect(PinList.safeParse(await (await t.get("#bubble/games")).json()).data?.pins).toHaveLength(1);
  });

  it("refuses a moderator pinning in another world's room, though the line's id is a real one", async () => {
    const t = setup();
    const response = await t.pin({ room: "#earth", msgid: "m2" }, { who: "mod" });
    expect(response.status).toBe(403);
    expect(t.calls).toEqual([]);
  });

  it.each([
    ["a text of the page's own", { room: "#bubble/games", msgid: "m2", text: "forged" }],
    ["an author of the page's own", { room: "#bubble/games", msgid: "m2", account: ALICE }],
    ["no msgid", { room: "#bubble/games" }],
    ["a msgid with a comma", { room: "#bubble/games", msgid: "a,b" }],
    ["a room that is no room's", { room: "games", msgid: "m2" }],
    ["a room past Ergo's 64 characters", { room: `#${"a".repeat(64)}`, msgid: "m2" }],
    ["a msgid with a line break and a command", { room: "#bubble/games", msgid: "m2\r\nQUIT" }],
    ["a body that is no JSON", "{not json"],
    ["a list", [{ room: "#bubble/games", msgid: "m2" }]],
  ])("refuses %s as a bad body, before it asks Ergo anything", async (_, request) => {
    const t = setup();
    const response = await t.pin(request, { who: "mod" });
    expect([response.status, await response.json()]).toEqual([400, { error: "refused" }]);
    expect(t.calls).toEqual([]);
  });

  it("refuses a body past the server's limit", async () => {
    const response = await setup().pin(`{"room":"#bubble","msgid":"${"m".repeat(BODY_LIMIT)}"}`, { who: "mod" });
    expect(response.status).toBe(413);
  });

  it.each([
    ["a line Ergo does not hold", "not_found", [404, "not_found"]],
    ["a room already holding its most, in a code of its own", "full", [409, "full"]],
    ["a line that is no plain message", "refused", [400, "refused"]],
    ["a line Ergo could not be asked for, which is not a line gone", "unavailable", [503, "not_ready"]],
  ] as const)("answers %s with its own code", async (_, answer, [status, error]) => {
    const t = setup({ answer });
    const response = await t.pin({ room: "#bubble/games", msgid: "m2" }, { who: "mod" });
    expect([response.status, await response.json()]).toEqual([status, { error }]);
    expect(t.events().join("\n")).toContain("pin_refused");
  });

  // The number is the decision's (docs/decisions.md, 2026-10-27), not the code's own.
  it("takes 30 pins a minute from one account, then refuses before asking Ergo, and again after the minute", async () => {
    const t = setup({ answer: "already" });
    for (let n = 0; n < 30; n += 1)
      expect((await t.pin({ room: "#bubble/games", msgid: "m1" }, { who: "mod" })).status).toBe(200);
    const refused = await t.pin({ room: "#bubble/games", msgid: "m1" }, { who: "mod" });
    expect([refused.status, await refused.json()]).toEqual([429, { error: "too_many" }]);
    expect(t.calls).toHaveLength(30);
    t.clock.now += MINUTE - 1;
    expect((await t.pin({ room: "#bubble/games", msgid: "m1" }, { who: "mod" })).status).toBe(429);
    t.clock.now += 1;
    expect((await t.pin({ room: "#bubble/games", msgid: "m1" }, { who: "mod" })).status).toBe(200);
  });

  it("counts an unpin in the same thirty, and each account's own apart", async () => {
    const t = setup({ answer: "already" });
    for (let n = 0; n < 29; n += 1) await t.pin({ room: "#bubble/games", msgid: "m1" }, { who: "mod" });
    expect((await t.unpin("#bubble/games", "m1", { who: "mod" })).status).toBe(200);
    expect((await t.unpin("#bubble/games", "m1", { who: "mod" })).status).toBe(429);
    expect((await t.pin({ room: "#bubble/games", msgid: "m1" }, { who: "mod" })).status).toBe(429);
    // The team's own thirty, and a refused request of the moderator's took none from it.
    expect((await t.pin({ room: "#bubble/games", msgid: "m1" }, { who: "team" })).status).toBe(200);
    // A reader is refused for want of the right, not by a limit that is the moderators'.
    expect((await t.pin({ room: "#bubble/games", msgid: "m1" }, { who: "alice" })).status).toBe(403);
  });

  it("logs the room, the account and the line's id of a pin, never its text", async () => {
    const t = setup();
    await t.pin({ room: "#bubble/games", msgid: "m2" }, { who: "mod" });
    const added = t.events().find((line) => line.includes("pin_added")) ?? "";
    expect(added).toContain("#bubble/games");
    expect(added).toContain("m2");
    expect(added).not.toContain("text m2");
  });

  // The audit log of an unpin names what the pin's does: the room, the line, the account (as the log hashes it), no text (G10).
  it("logs the room, the line's id and the account of an unpin too, and its account is the one that unpinned", async () => {
    const t = setup();
    await t.pin({ room: "#bubble/games", msgid: "m2" }, { who: "mod" });
    await t.pin({ room: "#bubble/games", msgid: "m3" }, { who: "team" });
    await t.unpin("#bubble/games", "m2", { who: "team" });
    await t.unpin("#bubble/games", "m3", { who: "mod" });
    const event = (name: string, msgid: string) =>
      t.events().find((line) => line.includes(name) && line.includes(`"msgid":"${msgid}"`)) ?? "";
    const accountOf = (line: string) => /"account":"([0-9a-f]{64})"/.exec(line)?.[1];
    const [addedByMod, addedByTeam] = [event("pin_added", "m2"), event("pin_added", "m3")];
    const [removedByTeam, removedByMod] = [event("pin_removed", "m2"), event("pin_removed", "m3")];
    for (const line of [removedByTeam, removedByMod]) {
      expect(line).toContain('"room":"#bubble/games"');
      expect(line).not.toContain("text m");
      expect(accountOf(line)).toBeDefined();
    }
    expect(accountOf(removedByTeam)).toBe(accountOf(addedByTeam));
    expect(accountOf(removedByMod)).toBe(accountOf(addedByMod));
    expect(accountOf(removedByTeam)).not.toBe(accountOf(removedByMod));
  });
});

// A failure of the database is the server's: a code and no more, and what the database said is no one's to read.
describe("a pin's store that fails", () => {
  it.each([
    ["reading the pins", "list", (t: ReturnType<typeof setup>) => t.get("#bubble/games")],
    [
      "adding a pin",
      "add",
      (t: ReturnType<typeof setup>) => t.pin({ room: "#bubble/games", msgid: "m2" }, { who: "mod" }),
    ],
  ] as const)("answers 500 and a code alone while %s, and logs no text", async (_, breaks, call) => {
    const t = setup({ breaks });
    const response = await call(t);
    expect([response.status, await response.json()]).toEqual([500, { error: "internal" }]);
    expect(t.events().join("\n")).not.toContain("secret");
  });
});

describe("unpinning a line", () => {
  it("lets the room's moderator unpin it, and answers the pins left", async () => {
    const t = setup();
    const response = await t.unpin("#bubble/games", "m1", { who: "mod" });
    expect(response.status).toBe(200);
    expect(await body(response)).toEqual({ room: "#bubble/games", may: true, pins: [] });
    expect(t.calls).toEqual(["remove #bubble/games m1"]);
    expect(t.events()).toContainEqual(expect.stringContaining('"pin_removed"'));
  });

  it.each([
    ["no session", {}, [401, "unauthenticated"]],
    ["a reader", { who: "alice" }, [403, "forbidden"]],
    ["another world's moderator", { who: "other" }, [403, "forbidden"]],
    ["an Origin not listed", { who: "mod", origin: "https://evil.test" }, [403, "forbidden"]],
    ["no Origin", { who: "mod", origin: null }, [403, "forbidden"]],
    ["a body that is not JSON", { who: "mod", type: "text/plain" }, [415, "unsupported"]],
  ])("refuses %s, and removes nothing", async (_, more, [status, error]) => {
    const t = setup();
    const response = await t.unpin("#bubble/games", "m1", more);
    expect([response.status, await response.json()]).toEqual([status, { error }]);
    expect(t.calls).toEqual([]);
  });

  it("answers not_found for a line that is not pinned", async () => {
    const response = await setup().unpin("#bubble/games", "nope", { who: "mod" });
    expect([response.status, await response.json()]).toEqual([404, { error: "not_found" }]);
  });

  it.each([
    ["no msgid", { room: "#bubble/games" }],
    ["a msgid with a comma", { room: "#bubble/games", msgid: "a,b" }],
    ["a text beside it", { room: "#bubble/games", msgid: "m1", text: "x" }],
  ])("refuses %s as a bad body", async (_, request) => {
    const t = setup();
    const response = await t.ask("POST", "/unpin", { body: request, who: "mod" });
    expect([response.status, await response.json()]).toEqual([400, { error: "refused" }]);
    expect(t.calls).toEqual([]);
  });
});

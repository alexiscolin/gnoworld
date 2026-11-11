import { createHmac } from "node:crypto";
import { Address, PinList } from "@gnoworld/schemas";
import { describe, expect, it, vi } from "vitest";
import { z } from "zod";
import { BODY_LIMIT, makeApp } from "../app.ts";
import { logger } from "@gnoworld/service/log";
import type { Right } from "../roles/mayModerate.ts";
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
  show,
  right = (room, who) => Promise.resolve(mayPin(room, who) ? ({ as: "staff" } as const) : false),
}: {
  answer?: "pinned" | "already" | "not_found" | "full" | "refused" | "unavailable";
  breaks?: "list" | "add";
  // The room's right as the server gives it from step 2 of part 4: asynchronous, naming what gave it (an owner's, the owner's address).
  right?: (room: string, who: string, visitor: string) => Promise<Right | false>;
  // What the list's `may` asks, the display pool's: the action's by default.
  show?: (room: string, who: string, visitor: string) => Promise<Right | false>;
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
      mayPin: right,
      mayShow: show ?? right,
      readable,
      session: (token) => TOKENS.get(token ?? ""),
      origins: [ORIGIN],
      log,
      now: () => clock.now,
    }),
  );
  interface Ask {
    who?: string;
    peer?: string;
    origin?: string | null;
    type?: string | null;
    body?: unknown;
  }
  const headersOf = (method: string, { who, origin = ORIGIN, type = "application/json" }: Ask) => ({
    ...(origin === null ? {} : { origin }),
    ...(type === null || method === "GET" ? {} : { "content-type": type }),
    ...(who === undefined ? {} : { cookie: `__Host-session=${who}` }),
  });
  const ask = (method: string, query: string, more: Ask = {}) =>
    app.request(
      `/api/pins${query}`,
      {
        method,
        headers: headersOf(method, more),
        ...(more.body === undefined
          ? {}
          : { body: typeof more.body === "string" ? more.body : JSON.stringify(more.body) }),
      },
      { incoming: { socket: { remoteAddress: more.peer ?? "203.0.113.7" } } },
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

// Part 4 (docs/plans/owners-moderation.md, section 3): the right is asynchronous and says what gave it. An owner of the realm's namespace
// pins in its rooms, the log names the account and the owner, and a right that cannot be computed refuses before Ergo is asked.
const hmac = (who: string): string =>
  createHmac("sha256", "a-pepper-of-forty-characters-0123456789").update(who).digest("hex");
const OWNER = Address.parse("g1mpkp5lm8lwpm0pym4388836d009zfe4maxlqsq");
const REALM = "#acme-feed";
const STAFF_RIGHT = { as: "staff" } as const;
const OWNER_RIGHT = { as: "owner", owner: OWNER } as const;
const owners = (room: string, who: string): Promise<Right | false> =>
  Promise.resolve(room.startsWith("#acme") && who === OWNER ? OWNER_RIGHT : who === MOD ? STAFF_RIGHT : false);
const logged = (t: ReturnType<typeof setup>, event: string) =>
  t
    .events()
    .map((line) => z.record(z.string(), z.unknown()).parse(JSON.parse(line.replace(/^\{/, '{"time":"x",'))))
    .find((line) => line["event"] === event);

describe("an owner's right (part 4)", () => {
  // The owner's session is added to the shared token table for these tests alone.
  const withOwner = (more: Parameters<typeof setup>[0] = {}) => {
    TOKENS.set("owner", OWNER);
    return setup({ right: owners, ...more });
  };

  it("lets the holder of the realm's namespace pin in a realm room, the log naming the account, the owner and `as`", async () => {
    const t = withOwner();
    const response = await t.pin({ room: REALM, msgid: "m9" }, { who: "owner" });
    expect(response.status).toBe(200);
    expect(t.calls).toEqual([`add ${REALM} m9 ${OWNER}`]);
    const line = logged(t, "pin_added");
    expect(line).toMatchObject({ event: "pin_added", room: REALM, msgid: "m9", as: "owner" });
    expect(Object.keys(line ?? {})).toEqual(expect.arrayContaining(["account", "owner"]));
  });

  it("logs a staff pin as staff, never as an owner's", async () => {
    const t = withOwner();
    await t.pin({ room: REALM, msgid: "m9" }, { who: "mod" });
    expect(logged(t, "pin_added")).toMatchObject({ as: "staff" });
  });

  it("logs an owner's unpin with the account, the owner and `as`, and names no identity in the answer", async () => {
    const t = withOwner();
    await t.pin({ room: REALM, msgid: "m1" }, { who: "owner" });
    const response = await t.unpin(REALM, "m1", { who: "owner" });
    expect(logged(t, "pin_removed")).toMatchObject({ as: "owner", account: hmac(OWNER), owner: hmac(OWNER) });
    expect(JSON.stringify(await response.json())).not.toContain("owner");
  });

  it("refuses an owner of another namespace in this room, before Ergo is asked", async () => {
    const t = withOwner();
    const response = await t.pin({ room: "#other-feed", msgid: "m9" }, { who: "owner" });
    expect([response.status, await response.json()]).toEqual([403, { error: "forbidden" }]);
    expect(t.calls).toEqual([]);
  });

  it("says in the list that an owner may pin, and that a reader may not", async () => {
    const t = withOwner();
    expect((await body(await t.get(REALM, "owner"))).may).toBe(true);
    expect((await body(await t.get(REALM, "alice"))).may).toBe(false);
  });

  it("asks the right after the session and the body, never before", async () => {
    const asked: string[] = [];
    const t = withOwner({
      right: (room, who) => {
        asked.push(`${room} ${who}`);
        return owners(room, who);
      },
    });
    await t.pin({ room: REALM, msgid: "m9" });
    await t.pin({ room: REALM }, { who: "owner" });
    await t.pin({ room: REALM, msgid: "m9" }, { who: "owner", origin: "https://evil.test" });
    expect(asked).toEqual([]);
  });

  it("refuses, with Ergo asked nothing, when the right's read fails (the 5-second outage), and the failure is no pin", async () => {
    const t = withOwner({ right: () => Promise.reject(new Error("the chain said: secret")) });
    const response = await t.pin({ room: REALM, msgid: "m9" }, { who: "owner" });
    expect(response.status).toBeGreaterThanOrEqual(400);
    expect(JSON.stringify(await response.json())).not.toContain("secret");
    expect(t.calls).toEqual([]);
  });

  it("refuses a pin whose right resolves false after a slow read, as it does one that resolves at once", async () => {
    const slow = (): Promise<false> =>
      new Promise((resolve) => {
        setTimeout(() => {
          resolve(false);
        }, 20);
      });
    const t = withOwner({ right: slow });
    const response = await t.pin({ room: REALM, msgid: "m9" }, { who: "owner" });
    expect([response.status, await response.json()]).toEqual([403, { error: "forbidden" }]);
    expect(t.calls).toEqual([]);
  });

  it("gives the right the visitor as the limits count it, an IPv6 one by its /64", async () => {
    const seen: (string | undefined)[] = [];
    const t = withOwner({
      right: (room, who, visitor) => {
        seen.push(visitor);
        return owners(room, who);
      },
    });
    await t.pin({ room: REALM, msgid: "m9" }, { who: "owner", peer: "2001:db8:1:2:aaaa:bbbb:cccc:dddd" });
    await t.pin({ room: REALM, msgid: "m8" }, { who: "owner", peer: "203.0.113.7" });
    // Each pin asks the right, then the list it answers asks it again.
    expect([seen[0], seen[2]]).toEqual(["2001:db8:1:2::/64", "203.0.113.7"]);
  });

  it("answers a list with may false, not an error, when the right cannot be read, and asks nothing for a guest", async () => {
    const asked: string[] = [];
    const t = withOwner({
      show: (room, who) => {
        asked.push(`${room} ${who}`);
        return Promise.reject(new Error("down"));
      },
    });
    const response = await t.get(REALM, "owner");
    expect([response.status, (await body(response)).may]).toEqual([200, false]);
    await t.get(REALM);
    expect(asked).toEqual([`${REALM} ${OWNER}`]);
  });

  it("answers a list with may false after 5 seconds when the right never settles, the pins still shown", async () => {
    vi.useFakeTimers();
    try {
      const t = withOwner({ show: () => new Promise<never>(() => undefined) });
      const pending = Promise.resolve(t.get(REALM, "owner"));
      await vi.advanceTimersByTimeAsync(4_999);
      let settled = false;
      pending.then(
        () => {
          settled = true;
        },
        () => undefined,
      );
      await vi.advanceTimersByTimeAsync(0);
      expect(settled).toBe(false);
      await vi.advanceTimersByTimeAsync(1);
      const response = await pending;
      expect([response.status, (await body(response)).may]).toEqual([200, false]);
    } finally {
      vi.useRealTimers();
    }
  });

  it("logs the acting account and the owner as the log's hashes, with `as`, when a linked account acts for its identity's owner", async () => {
    const t = withOwner({ right: () => Promise.resolve({ as: "owner", owner: OWNER }) });
    await t.pin({ room: REALM, msgid: "m9" }, { who: "alice" });
    const line = logged(t, "pin_added");
    expect(line).toMatchObject({ as: "owner", account: hmac(ALICE), owner: hmac(OWNER), msgid: "m9" });
    expect(line?.["account"]).not.toBe(line?.["owner"]);
  });

  it("asks the display right for a list's `may` and the action right for a pin, so a flood of lists never spends an owner's reads", async () => {
    const shown: string[] = [];
    const acted: string[] = [];
    const t = withOwner({
      show: (room, who) => {
        shown.push(`${room} ${who}`);
        return owners(room, who);
      },
      right: (room, who) => {
        acted.push(`${room} ${who}`);
        return owners(room, who);
      },
    });
    await t.get(REALM, "owner");
    expect([shown.length, acted.length]).toEqual([1, 0]);
    await t.pin({ room: REALM, msgid: "m9" }, { who: "owner" });
    expect(acted).toEqual([`${REALM} ${OWNER}`]);
    expect(shown).toHaveLength(2);
  });

  it("shows no identity in a room's pins: the list has no pinned_by and no owner", async () => {
    const t = withOwner();
    await t.pin({ room: REALM, msgid: "m9" }, { who: "owner" });
    const text = JSON.stringify(await (await t.get(REALM, "owner")).json());
    expect(text).not.toContain("pinned_by");
    expect(text).not.toContain("owner");
  });
});

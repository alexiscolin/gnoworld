import type { DatabaseSync } from "node:sqlite";
import { Address } from "@gnoworld/schemas";
import { afterEach, describe, expect, it } from "vitest";
import { BODY_LIMIT, makeApp } from "../app.ts";
import { openDatabase } from "@gnoworld/service/db";
import { logger } from "@gnoworld/service/log";
import type { Room, Roles } from "../roles/roles.ts";
import { EARTH_TABLES, makeRooms, REALM_PATH, REALM_TABLES, ROOM_STATE } from "./create.ts";
import { ensureNamed, ensureRooms, listRooms, ROOM_TABLES } from "./rooms.ts";
import { roomsRoutes } from "./routes.ts";

const T0 = Date.parse("2026-10-22T12:00:00.000Z");
const HOUR = 60 * 60_000;
const ORIGIN = "https://gnoworld.test";
const PEER = "203.0.113.7";
const RULES = { bannedWords: [], linksPerMessage: 3, mentionsPerMessage: 5, linksForNewAccount: 2 };
const TEAM = Address.parse("g1jg8mtutu9khhfwc4nxmuhcpftf0pajdhfvsqf5");
const TRUSTED = Address.parse("g10gh7yq7swv77efwfcqy2znp37cmeughxx3y5tv");
const EARTH_MOD = Address.parse("g1zgldsmn6ck6w4p325xd3j8y779ky6fpjnz3uh9");
const BUBBLE_MOD = Address.parse("g1m68zzc430znqyxzv6jsfz45hgccacx3mk6qajw");
const STRANGER = Address.parse("g1uauvt7txunf9zeu2qyrzv0pa5uvwjlq90r3qpa");
// A world whose slug leaves 31 characters for a room's name in Ergo's 64.
const LONG = "w".repeat(31);
const ROLES: Roles = {
  team: new Set([TEAM]),
  trusted: new Set([TRUSTED]),
  worlds: new Map([
    [
      "earth",
      {
        moderators: new Set([EARTH_MOD]),
        rules: RULES,
        rooms: new Map<string, Room>([["#earth/lounge", { type: "open", hidden: false }]]),
        sections: [{ name: "Talk", rooms: ["#earth/ghost"] }],
      },
    ],
    [
      "bubble",
      {
        moderators: new Set([BUBBLE_MOD]),
        rules: RULES,
        rooms: new Map<string, Room>([
          ["#bubble/open", { type: "open", hidden: false }],
          ["#bubble/news", { type: "announcement", hidden: false }],
          ["#bubble/accounts", { type: "accounts", hidden: false }],
          ["#bubble/crew", { type: "members", readers: "crew", hidden: false }],
          ["#bubble/crew-write", { type: "members-write", readers: "crew", writers: "crew", hidden: false }],
        ]),
      },
    ],
    [LONG, { moderators: new Set<Address>(), rules: RULES }],
  ]),
};
// Each session's cookie names its account, as the login's tokens would.
const TOKENS = new Map<string, Address>([
  ["team", TEAM],
  ["trusted", TRUSTED],
  ["earth", EARTH_MOD],
  ["bubble", BUBBLE_MOD],
  ["stranger", STRANGER],
]);

const opened: DatabaseSync[] = [];
afterEach(() => {
  for (const db of opened.splice(0)) db.close();
});

type Named = "pass" | "hide" | "unchecked" | "throws";
const setup = ({
  max = 20,
  named = "pass",
  checked = true,
}: { max?: number; named?: Named; checked?: boolean } = {}) => {
  const db = openDatabase(":memory:", [ROOM_TABLES, ROOM_STATE, REALM_TABLES, REALM_PATH, EARTH_TABLES]);
  opened.push(db);
  ensureRooms(db, ["bubble", "earth", LONG], T0);
  const clock = { now: T0 };
  const sent: string[] = [];
  const rooms = makeRooms({
    db,
    send: (command, params) => sent.push([command, ...params].join(" ")) > 0,
    now: () => clock.now,
    max,
  });
  const lines: string[] = [];
  const log = logger("a-pepper-of-forty-characters-0123456789", (line) => lines.push(line));
  const app = makeApp(log, () => true);
  const checks: string[] = [];
  const nameCheck = (world: string, name: string): Promise<"pass" | "hide" | "unchecked"> => {
    checks.push(`${world}/${name}`);
    return named === "throws" ? Promise.reject(new Error("down")) : Promise.resolve(named);
  };
  const session = (token: string | undefined) => TOKENS.get(token ?? "");
  app.route(
    "/api/rooms",
    roomsRoutes({
      roles: ROLES,
      rooms,
      session,
      origins: [ORIGIN],
      log,
      now: () => clock.now,
      ...(checked ? { nameCheck } : {}),
    }),
  );
  interface Ask {
    body?: unknown;
    who?: string;
    origin?: string | null;
    type?: string | null;
  }
  const ask = (method: string, path: string, { body, who, origin = ORIGIN, type = "application/json" }: Ask) =>
    app.request(
      path,
      {
        method,
        headers: {
          ...(origin === null ? {} : { origin }),
          ...(type === null ? {} : { "content-type": type }),
          ...(who === undefined ? {} : { cookie: `__Host-session=${who}` }),
        },
        ...(body === undefined ? {} : { body: typeof body === "string" ? body : JSON.stringify(body) }),
      },
      { incoming: { socket: { remoteAddress: PEER } } },
    );
  const create = (body: unknown, more: Ask = {}) => ask("POST", "/api/rooms", { ...more, body });
  const archive = (path: string, more: Ask = {}) => ask("DELETE", `/api/rooms/${path}`, more);
  // The log's lines, their time left out.
  const events = () => lines.map((line) => line.replace(/^\{"time":"[^"]+",/, "{"));
  return { db, rooms, clock, sent, create, archive, events, checks };
};
const answer = async (response: Response) => [
  response.status,
  await response.text(),
  response.headers.get("cache-control"),
];
const REFUSED = '{"error":"refused"}';

describe("making a room", () => {
  it("lets the world's moderators and the team make its rooms, and refuses everyone else before any work", async () => {
    const { db, sent, create } = setup();
    const asks: [string | undefined, number, string][] = [
      [undefined, 401, '{"error":"unauthenticated"}'],
      ["stranger", 403, '{"error":"forbidden"}'],
      ["trusted", 403, '{"error":"forbidden"}'],
      ["earth", 403, '{"error":"forbidden"}'],
      ["bubble", 201, '{"room":"#bubble/room-bubble"}'],
      ["team", 201, '{"room":"#bubble/room-team"}'],
    ];
    for (const [who, status, body] of asks) {
      const response = await create(
        { world: "bubble", name: `room-${who ?? "guest"}` },
        who === undefined ? {} : { who },
      );
      expect([who, ...(await answer(response))]).toEqual([who, status, body, "no-store"]);
    }
    expect(listRooms(db).map(({ name }) => name)).toEqual([
      "#bubble",
      "#bubble/room-bubble",
      "#bubble/room-team",
      "#earth",
      `#${LONG}`,
    ]);
    expect(sent.filter((line) => line.startsWith("JOIN"))).toEqual([
      "JOIN #bubble/room-bubble",
      "JOIN #bubble/room-team",
    ]);
  });

  it("answers a bad body with no session 401, as any call with no session, and with one 400 (F569)", async () => {
    const { sent, create } = setup();
    for (const body of ["{", { world: "bubble", name: "Bad Name" }]) {
      expect(await answer(await create(body))).toEqual([401, '{"error":"unauthenticated"}', "no-store"]);
      expect(await answer(await create(body, { who: "stranger" }))).toEqual([400, REFUSED, "no-store"]);
    }
    expect(sent).toEqual([]);
  });

  it("logs who made which room, and each refusal's cause, never the cookie nor a refused name", async () => {
    const { create, events } = setup();
    await create({ world: "bubble", name: "garden" }, { who: "bubble" });
    await create({ world: "bubble", name: "garden" }, { who: "stranger" });
    await create({ world: "bubble", name: "Bad\nname" }, { who: "bubble" });
    await create({ world: "bubble", name: "garden" }, { who: "bubble" });
    const logged = events();
    expect(logged[0]).toMatch(/^\{"event":"room_made","room":"#bubble\/garden","account":"[0-9a-f]{64}"\}\n$/);
    expect(logged.slice(1)).toEqual([
      '{"event":"room_refused","route":"/api/rooms","status":403,"error":"forbidden"}\n',
      '{"event":"room_refused","route":"/api/rooms","status":400,"error":"body"}\n',
      '{"event":"room_refused","route":"/api/rooms","status":400,"error":"exists"}\n',
    ]);
    expect(logged.join("")).not.toMatch(/bubble"|Bad|g1m68/);
  });

  it.each([
    ["a CR", "gar\rden"],
    ["a LF", "gar\nden"],
    ["a slash", "gar/den"],
    ["a space", "gar den"],
    ["a capital", "Garden"],
    ["33 characters", "a".repeat(33)],
  ])("refuses a name with %s, making nothing", async (_, name) => {
    const { sent, create } = setup();
    expect(await answer(await create({ world: "bubble", name }, { who: "team" }))).toEqual([400, REFUSED, "no-store"]);
    expect(sent).toEqual([]);
  });

  it.each([
    ["not JSON", "{"],
    ["null", "null"],
    ["a list", "[]"],
    ["a string", '"x"'],
    ["a list for a world", { world: ["bubble"], name: "garden" }],
    ["an object for a name", { world: "bubble", name: {} }],
    ["a number for a name", { world: "bubble", name: 7 }],
    ["a prototype", '{"__proto__":{"world":"bubble","name":"garden"}}'],
    ["a field more", { world: "bubble", name: "garden", type: "members" }],
  ])("refuses a body that is %s, making nothing", async (_, body) => {
    const { sent, create } = setup();
    expect(await answer(await create(body, { who: "team" }))).toEqual([400, REFUSED, "no-store"]);
    expect(sent).toEqual([]);
  });

  it("refuses a body past the server's limit with 413", async () => {
    const { sent, create } = setup();
    const response = await create({ world: "bubble", name: "a".repeat(BODY_LIMIT) }, { who: "team" });
    expect(response.status).toBe(413);
    expect(sent).toEqual([]);
  });

  it("refuses a world no file names, even to the team", async () => {
    const { create } = setup();
    expect((await answer(await create({ world: "nowhere", name: "garden" }, { who: "team" })))[0]).toBe(403);
  });

  it("refuses a name whose channel would pass Ergo's 64 characters, and makes one of 64", async () => {
    const { sent, create } = setup();
    expect(await answer(await create({ world: LONG, name: "a".repeat(32) }, { who: "team" }))).toEqual([
      400,
      REFUSED,
      "no-store",
    ]);
    expect(sent).toEqual([]);
    expect((await create({ world: LONG, name: "a".repeat(31) }, { who: "team" })).status).toBe(201);
  });

  it("refuses a name its world has, and a room past the world's cap", async () => {
    const { create } = setup({ max: 1 });
    expect((await create({ world: "bubble", name: "garden" }, { who: "bubble" })).status).toBe(201);
    expect(await answer(await create({ world: "bubble", name: "garden" }, { who: "bubble" }))).toEqual([
      400,
      REFUSED,
      "no-store",
    ]);
    expect(await answer(await create({ world: "bubble", name: "pond" }, { who: "bubble" }))).toEqual([
      429,
      '{"error":"too_many"}',
      "no-store",
    ]);
  });

  it("makes one room of two creates at once", async () => {
    const { db, create } = setup();
    const both = await Promise.all(
      [1, 2].map(async () => create({ world: "bubble", name: "garden" }, { who: "bubble" })),
    );
    expect(both.map(({ status }) => status).toSorted()).toEqual([201, 400]);
    expect(listRooms(db).filter(({ name }) => name === "#bubble/garden")).toHaveLength(1);
  });

  it("holds an account to 10 rooms an hour by the clock, counting only the rooms made", async () => {
    const { clock, create } = setup({ max: 50 });
    await create({ world: "bubble", name: "r0" }, { who: "stranger" });
    await create({ world: "bubble", name: "Bad" }, { who: "bubble" });
    for (let n = 0; n < 10; n += 1)
      expect((await create({ world: "bubble", name: `r${String(n)}` }, { who: "bubble" })).status).toBe(201);
    expect((await create({ world: "bubble", name: "r0" }, { who: "bubble" })).status).toBe(429);
    clock.now = T0 + HOUR - 1;
    expect((await create({ world: "bubble", name: "r10" }, { who: "bubble" })).status).toBe(429);
    expect((await create({ world: "bubble", name: "r10" }, { who: "team" })).status).toBe(201);
    clock.now = T0 + HOUR;
    expect((await create({ world: "bubble", name: "r11" }, { who: "bubble" })).status).toBe(201);
  });

  it("refuses a create from no listed site, or not as JSON", async () => {
    const { create } = setup();
    const forbidden = [403, '{"error":"forbidden"}', "no-store"];
    expect(await answer(await create({ world: "bubble", name: "a" }, { who: "team", origin: null }))).toEqual(
      forbidden,
    );
    expect(
      await answer(await create({ world: "bubble", name: "a" }, { who: "team", origin: "https://evil.test" })),
    ).toEqual(forbidden);
    expect(await answer(await create({ world: "bubble", name: "a" }, { who: "team", type: "text/plain" }))).toEqual([
      415,
      '{"error":"unsupported"}',
      "no-store",
    ]);
  });
});

describe("archiving a room", () => {
  it("lets the same people archive it, refusing everyone else before any work, the room's existence unsaid", async () => {
    const { sent, create, archive } = setup();
    await create({ world: "bubble", name: "garden" }, { who: "team" });
    sent.splice(0);
    for (const [path, who, status, body] of [
      ["bubble/garden", undefined, 401, '{"error":"unauthenticated"}'],
      ["bubble/garden", "stranger", 403, '{"error":"forbidden"}'],
      ["bubble/garden", "earth", 403, '{"error":"forbidden"}'],
      ["bubble/nowhere", "stranger", 403, '{"error":"forbidden"}'],
      ["nowhere/garden", "team", 403, '{"error":"forbidden"}'],
    ] as const) {
      expect(await answer(await archive(path, who === undefined ? {} : { who }))).toEqual([status, body, "no-store"]);
    }
    expect(sent).toEqual([]);
    expect(await answer(await archive("bubble/garden", { who: "bubble" }))).toEqual([204, "", "no-store"]);
    expect(sent).toEqual(["SAMODE #bubble/garden +m", "SAMODE #bubble/garden +s"]);
    expect((await archive("bubble/garden", { who: "bubble" })).status).toBe(204);
    expect(sent).toHaveLength(2);
  });

  it.each(["open", "news", "accounts", "crew", "crew-write"])(
    "refuses to archive #bubble/%s, a room the roles file types, to a moderator and to the team alike (F2050)",
    async (name) => {
      const { db, sent, archive, events } = setup();
      ensureNamed(db, [{ name: `#bubble/${name}`, world: "bubble" }], T0);
      for (const who of ["bubble", "team"]) {
        expect(await answer(await archive(`bubble/${name}`, { who }))).toEqual([
          403,
          '{"error":"forbidden"}',
          "no-store",
        ]);
      }
      expect(sent).toEqual([]);
      expect(db.prepare("SELECT archived FROM rooms WHERE name = ?").get(`#bubble/${name}`)).toEqual({ archived: 0 });
      expect(events().at(-1)).toMatch(/"room_refused".*"error":"forbidden"/);
    },
  );

  it("logs who archived which room", async () => {
    const { create, archive, events } = setup();
    await create({ world: "bubble", name: "garden" }, { who: "team" });
    await archive("bubble/garden", { who: "bubble" });
    expect(events().at(-1)).toMatch(
      /^\{"event":"room_archived","room":"#bubble\/garden","account":"[0-9a-f]{64}"\}\n$/,
    );
  });

  it("finds no room it never made, and archives no main room", async () => {
    const { archive } = setup();
    expect(await answer(await archive("bubble/nowhere", { who: "team" }))).toEqual([
      404,
      '{"error":"not_found"}',
      "no-store",
    ]);
    expect((await archive("bubble", { who: "team" })).status).toBe(404);
  });

  it.each([
    ["a #", "%23bubble"],
    ["a CR LF", "gar%0d%0aden"],
    ["NUL", "gar%00den"],
    ["a space", "gar%20den"],
    ["33 characters", "a".repeat(33)],
    ["an accent", "caf%C3%A9"],
  ])("refuses a name with %s, sending nothing", async (_, name) => {
    const { sent, archive } = setup();
    expect(await answer(await archive(`bubble/${name}`, { who: "team" }))).toEqual([400, REFUSED, "no-store"]);
    expect(sent).toEqual([]);
  });

  it("refuses an archive from no listed site, or not as JSON", async () => {
    const { create, archive } = setup();
    await create({ world: "bubble", name: "garden" }, { who: "team" });
    expect((await archive("bubble/garden", { who: "team", origin: "https://evil.test" })).status).toBe(403);
    expect((await archive("bubble/garden", { who: "team", type: null })).status).toBe(415);
  });
});

// D394: on the Earth a signed-in account makes a room: 3 a day, its name checked as a message is, never a guest.
describe("archiving a realm's room", () => {
  it("refuses a moderator of the hub and the team alike to archive a room made for a realm: it keeps +M, never +m +s", async () => {
    const { rooms, sent, archive } = setup();
    rooms.realm("#bubble/golf-0123456789");
    sent.splice(0);
    for (const who of ["bubble", "team"]) {
      expect(await answer(await archive("bubble/golf-0123456789", { who }))).toEqual([
        403,
        '{"error":"forbidden"}',
        "no-store",
      ]);
    }
    expect(rooms.archived("#bubble/golf-0123456789")).toBe(false);
    expect(sent).toEqual([]);
  });

  it("still lets a moderator archive a room the moderators made", async () => {
    const { rooms, create, archive } = setup();
    rooms.realm("#bubble/golf-0123456789");
    await create({ world: "bubble", name: "garden" }, { who: "team" });
    expect((await archive("bubble/garden", { who: "bubble" })).status).toBe(204);
  });
});

describe("a room anyone makes on the Earth", () => {
  const earth = (name: string) => ({ world: "earth", name });

  it("is made by any signed-in account as #earth/name, a guest refused 401 and the other worlds still the moderators'", async () => {
    const { db, create, checks } = setup();
    expect(await answer(await create(earth("coffee")))).toEqual([401, '{"error":"unauthenticated"}', "no-store"]);
    expect(await answer(await create(earth("coffee"), { who: "stranger" }))).toEqual([
      201,
      '{"room":"#earth/coffee"}',
      "no-store",
    ]);
    expect((await create({ world: "bubble", name: "coffee" }, { who: "stranger" })).status).toBe(403);
    expect(listRooms(db).map(({ name }) => name)).toContain("#earth/coffee");
    expect(checks).toEqual(["earth/coffee"]);
  });

  it("refuses a name the check hides with 400, makes nothing and takes nothing of the day", async () => {
    const { db, create } = setup({ named: "hide" });
    for (const name of ["a", "b", "c", "d"])
      expect(await answer(await create(earth(name), { who: "stranger" }))).toEqual([400, REFUSED, "no-store"]);
    expect(listRooms(db).map(({ name }) => name)).not.toContain("#earth/a");
    expect(db.prepare("SELECT count(*) AS n FROM earth_rooms").get()).toEqual({ n: 0 });
  });

  it("answers 503 not_ready when the name could not be checked, making nothing: it fails closed", async () => {
    const { sent, create } = setup({ named: "unchecked" });
    expect(await answer(await create(earth("coffee"), { who: "stranger" }))).toEqual([
      503,
      '{"error":"not_ready"}',
      "no-store",
    ]);
    expect(sent).toEqual([]);
  });

  it("is refused to every account when the server has no name check, as a moderator's route is not", async () => {
    const { sent, create } = setup({ checked: false });
    expect((await create(earth("coffee"), { who: "stranger" })).status).toBe(403);
    expect((await create(earth("staff"), { who: "earth" })).status).toBe(201);
    expect(sent).toContain("JOIN #earth/staff");
  });

  it("is 3 a day: the 4th answers 429 too_many without the check being asked, a day later it is made", async () => {
    const { clock, create, checks } = setup();
    for (const name of ["a", "b", "c"]) expect((await create(earth(name), { who: "stranger" })).status).toBe(201);
    checks.length = 0;
    expect(await answer(await create(earth("d"), { who: "stranger" }))).toEqual([
      429,
      '{"error":"too_many"}',
      "no-store",
    ]);
    expect(checks).toEqual([]);
    expect((await create(earth("d"), { who: "trusted" })).status).toBe(201);
    clock.now += 24 * HOUR + 1;
    expect((await create(earth("d2"), { who: "stranger" })).status).toBe(201);
  });

  it("does not check a name taken: 400 with no check asked", async () => {
    const { create, checks } = setup();
    await create(earth("coffee"), { who: "stranger" });
    checks.length = 0;
    expect((await create(earth("coffee"), { who: "trusted" })).status).toBe(400);
    expect(checks).toEqual([]);
  });

  it("limits an account's tries, refused names included, to 10 an hour: 429 with no check asked", async () => {
    const { create, checks } = setup({ named: "hide" });
    for (let n = 0; n < 10; n += 1) await create(earth(`try-${String(n)}`), { who: "stranger" });
    checks.length = 0;
    expect((await create(earth("one-more"), { who: "stranger" })).status).toBe(429);
    expect(checks).toEqual([]);
  });

  it("leaves a world's moderator on the earth with the old way: no check, no 3 a day, the world's cap", async () => {
    const { create, checks } = setup();
    for (const name of ["a", "b", "c", "d"]) expect((await create(earth(name), { who: "earth" })).status).toBe(201);
    expect(checks).toEqual([]);
  });

  it("lets its maker archive it, no other stranger, and the maker of another room not that one", async () => {
    const { archive, create } = setup();
    await create(earth("mine"), { who: "stranger" });
    await create(earth("theirs"), { who: "trusted" });
    expect((await archive("earth/mine", { who: "trusted" })).status).toBe(403);
    expect((await archive("earth/theirs", { who: "stranger" })).status).toBe(403);
    expect((await archive("earth/mine", { who: "stranger" })).status).toBe(204);
    expect((await archive("earth/mine")).status).toBe(401);
    expect((await archive("earth/none", { who: "stranger" })).status).toBe(403);
  });

  it("lets only the world's moderators archive a room it has no maker for, as before", async () => {
    const { archive, create } = setup();
    await create(earth("staff"), { who: "earth" });
    expect((await archive("earth/staff", { who: "stranger" })).status).toBe(403);
    expect((await archive("earth/staff", { who: "earth" })).status).toBe(204);
  });

  it("refuses a name the roles file types or places in a section, and makes its asker nobody's maker", async () => {
    const { create, db } = setup();
    for (const name of ["lounge", "ghost"]) {
      expect((await create(earth(name), { who: "stranger" })).status).toBe(400);
    }
    expect(db.prepare("SELECT count(*) AS n FROM earth_rooms").get()).toEqual({ n: 0 });
  });

  it("holds a burst: 30 at once make 3 rooms and ask the check 10 times at most, one name once", async () => {
    const { create, checks, db } = setup();
    const burst = await Promise.all(
      Array.from({ length: 30 }, (_, n) => Promise.resolve(create(earth(`room-${String(n)}`), { who: "stranger" }))),
    );
    expect(burst.filter(({ status }) => status === 201)).toHaveLength(3);
    expect(checks.length).toBeLessThanOrEqual(10);
    expect(db.prepare("SELECT count(*) AS n FROM earth_rooms").get()).toEqual({ n: 3 });
    const twins = await Promise.all([
      create(earth("same"), { who: "trusted" }),
      create(earth("same"), { who: "trusted" }),
    ]);
    expect(twins.map(({ status }) => status).toSorted()).toEqual([201, 400]);
  });

  it("answers 503 and makes nothing when the check itself throws", async () => {
    const { db, create } = setup({ named: "throws" });
    expect((await create(earth("coffee"), { who: "stranger" })).status).toBe(503);
    expect(db.prepare("SELECT count(*) AS n FROM earth_rooms").get()).toEqual({ n: 0 });
  });
});

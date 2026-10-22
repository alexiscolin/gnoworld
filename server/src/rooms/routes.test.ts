import type { DatabaseSync } from "node:sqlite";
import { Address } from "@gnoworld/schemas";
import { afterEach, describe, expect, it } from "vitest";
import { BODY_LIMIT, makeApp } from "../app.ts";
import { openDatabase } from "../db.ts";
import { logger } from "../log.ts";
import type { Roles } from "../roles/roles.ts";
import { makeRooms, ROOM_STATE } from "./create.ts";
import { ensureRooms, listRooms, ROOM_TABLES } from "./rooms.ts";
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
    ["earth", { moderators: new Set([EARTH_MOD]), rules: RULES }],
    ["bubble", { moderators: new Set([BUBBLE_MOD]), rules: RULES }],
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

const setup = ({ max = 20 }: { max?: number } = {}) => {
  const db = openDatabase(":memory:", [ROOM_TABLES, ROOM_STATE]);
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
  const session = (token: string | undefined) => TOKENS.get(token ?? "");
  app.route("/api/rooms", roomsRoutes({ roles: ROLES, rooms, session, origins: [ORIGIN], log, now: () => clock.now }));
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
  return { db, clock, sent, create, archive, events };
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

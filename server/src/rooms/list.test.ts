import type { DatabaseSync } from "node:sqlite";
import { RoomList } from "@gnoworld/schemas";
import { afterEach, describe, expect, it } from "vitest";
import { makeApp } from "../app.ts";
import { openDatabase } from "@gnoworld/service/db";
import { logger } from "@gnoworld/service/log";
import { VERDICT_TABLES } from "../moderation/check.ts";
import { EARTH_TABLES, ROOM_STATE } from "./create.ts";
import { ROOM_SAID } from "./earth.ts";
import { ensureNamed, ensureRooms, ROOM_TABLES } from "./rooms.ts";
import { listRoutes } from "./list.ts";
import type { Typed } from "./types.ts";

const T0 = Date.parse("2026-10-25T12:00:00.000Z");
const REFUSED = JSON.stringify({ error: "refused" });
const RULES = { bannedWords: [], linksPerMessage: 3, mentionsPerMessage: 5, linksForNewAccount: 2 };
const opened: DatabaseSync[] = [];
afterEach(() => {
  for (const db of opened.splice(0)) db.close();
});

// The Earth: five typed rooms, one hidden, the others as moderators made them (no type, so open), and four
// sections. #earth/ghost and #earth/ghost-two are named by a section and were never made.
const EARTH = {
  rules: RULES,
  rooms: new Map([
    ["#earth/news", { type: "announcement" as const, hidden: false }],
    ["#earth/door", { type: "accounts" as const, hidden: false }],
    ["#earth/crew", { type: "members" as const, readers: "crew", hidden: false }],
    ["#earth/desk", { type: "members-write" as const, readers: "crew", writers: "pens", hidden: false }],
    ["#earth/attic", { type: "open" as const, hidden: true }],
    ["#earth/lounge", { type: "open" as const, hidden: false }],
  ]),
  sections: [
    { name: "Announcements", rooms: ["#earth/news"] },
    { name: "Talk", rooms: ["#earth/lounge", "#earth", "#earth/garden", "#earth/ghost"] },
    { name: "Crew", rooms: ["#earth/crew", "#earth/desk", "#earth/attic"] },
    { name: "Nobody yet", rooms: ["#earth/ghost-two"] },
  ],
};
const ROLES: Typed = { worlds: new Map([["earth", EARTH]]) };
// Who sees what, as chat.ts's rule would answer: the members' rooms their members and the moderator, the
// hidden attic the moderator alone, the accounts room any account.
const visible = (room: string, who: string | undefined): boolean => {
  if (room === "#earth/crew" || room === "#earth/desk") return who === "member" || who === "mod";
  if (room === "#earth/attic") return who === "mod";
  if (room === "#earth/door") return who !== undefined;
  return true;
};
const TOKENS = new Map([
  ["stranger", "stranger"],
  ["member", "member"],
  ["mod", "mod"],
]);

const setup = (
  roles: Typed = ROLES,
  see: typeof visible = visible,
  here: (room: string) => number | undefined = () => undefined,
) => {
  const db = openDatabase(":memory:", [ROOM_TABLES, VERDICT_TABLES, ROOM_STATE, EARTH_TABLES, ROOM_SAID]);
  opened.push(db);
  // Made in an order no sort would give: the order of the answer is the route's.
  ensureNamed(
    db,
    ["#earth/zeta", "#earth/garden", "#earth/lounge", "#earth/crew", "#earth/attic", "#earth/alpha"].map((name) => ({
      name,
      world: "earth",
    })),
    T0,
  );
  ensureNamed(
    db,
    ["#earth/door", "#earth/desk", "#earth/news"].map((name) => ({ name, world: "earth" })),
    T0,
  );
  ensureRooms(db, ["earth", "bubble", "moon"], T0);
  ensureNamed(db, [{ name: "#bubble/x", world: "bubble" }], T0);
  const app = makeApp(
    logger("a-pepper-of-forty-characters-0123456789", () => true),
    () => true,
  );
  app.route(
    "/api/rooms",
    listRoutes({ db, roles, visible: see, here, now: () => T0, session: (token) => TOKENS.get(token ?? "") }),
  );
  const ask = async (query: string, headers: Record<string, string> = {}) => {
    const response = await app.request(`/api/rooms${query}`, { headers });
    return { response, status: response.status, text: await response.text() };
  };
  // The sections a reader gets, by room and type, parsed as the client parses them.
  const sectionsFor = async (who?: string, world = "earth") => {
    const { response, text } = await ask(
      `?world=${world}`,
      who === undefined ? {} : { cookie: `__Host-session=${who}` },
    );
    return { list: RoomList.parse(JSON.parse(text)), cache: response.headers.get("cache-control"), text };
  };
  return { db, app, ask, sectionsFor };
};

const open = (...rooms: string[]) => rooms.map((room) => ({ room, type: "open" }));

describe("GET /api/rooms?world=", () => {
  it("answers a guest the sections in the file's order, then a section named null with the other rooms", async () => {
    const { sectionsFor } = setup();
    expect((await sectionsFor()).list).toEqual({
      world: "earth",
      sections: [
        { name: "Announcements", rooms: [{ room: "#earth/news", type: "announcement" }] },
        // The section's own order, the main room third; a room no one made is not listed.
        { name: "Talk", rooms: open("#earth/lounge", "#earth", "#earth/garden") },
        { name: null, rooms: open("#earth/alpha", "#earth/zeta") },
      ],
    });
  });

  // What the client's RoomList takes: the file's 50 sections and the others, 1,100 rooms a section (D394: the Earth's thousand).
  // 50 named sections, then `count` rooms a guest sees after 100 it does not (#big/r0000 to r0099), all made
  // in reverse: the answer's order is the route's, and its cap counts the rooms a reader sees.
  const big = (count: number) => {
    const named = Array.from({ length: 50 }, (_, n) => ({
      name: `s${String(n)}`,
      rooms: [`#big/s${String(n).padStart(2, "0")}`],
    }));
    const roles: Typed = { worlds: new Map([["big", { rules: RULES, rooms: new Map(), sections: named }]]) };
    const others = Array.from({ length: count + 100 }, (_, n) => `#big/r${String(n).padStart(4, "0")}`);
    const hidden = new Set(others.slice(0, 100));
    const t = setup(roles, (room, who) => who !== undefined || !hidden.has(room));
    ensureRooms(t.db, ["big"], T0);
    const made = [...named.flatMap(({ rooms }) => rooms), ...others].reverse();
    ensureNamed(
      t.db,
      made.map((name) => ({ name, world: "big" })),
      T0,
    );
    return { ...t, seen: others.slice(100) };
  };

  it("answers 51 sections at most, and 1,100 rooms a reader sees in the others, the main room first, then by name", async () => {
    const { sectionsFor, seen } = big(1200);
    const { list } = await sectionsFor(undefined, "big");
    expect(list.sections).toHaveLength(51);
    expect(list.sections.at(-1)?.name).toBeNull();
    expect(list.sections.at(-1)?.rooms.map(({ room }) => room)).toEqual(["#big", ...seen.slice(0, 1099)]);
  });

  it.each([
    [1099, 1100],
    [1100, 1100],
  ])("lists %i rooms seen and the main room in the others as %i", async (count, listed) => {
    const { sectionsFor } = big(count);
    expect((await sectionsFor(undefined, "big")).list.sections.at(-1)?.rooms).toHaveLength(listed);
  });

  it("leaves out a section the reader sees no room of, and never says its name", async () => {
    const { sectionsFor } = setup();
    const { list, text } = await sectionsFor();
    expect(list.sections.map(({ name }) => name)).not.toContain("Crew");
    expect(list.sections.map(({ name }) => name)).not.toContain("Nobody yet");
    expect(text).not.toMatch(/Crew|Nobody yet|crew|desk|attic|door|ghost/);
  });

  it("gives an account the accounts room, and a member the members rooms, each with its type", async () => {
    const { sectionsFor } = setup();
    const door = { room: "#earth/door", type: "accounts" };
    expect((await sectionsFor("stranger")).list.sections.at(-1)).toEqual({
      name: null,
      rooms: [{ room: "#earth/alpha", type: "open" }, door, { room: "#earth/zeta", type: "open" }],
    });
    const member = (await sectionsFor("member")).list.sections;
    expect(member.map(({ name }) => name)).toEqual(["Announcements", "Talk", "Crew", null]);
    expect(member[2]).toEqual({
      name: "Crew",
      rooms: [
        { room: "#earth/crew", type: "members" },
        { room: "#earth/desk", type: "members-write" },
      ],
    });
    expect(member[3]?.rooms).toEqual([
      { room: "#earth/alpha", type: "open" },
      door,
      { room: "#earth/zeta", type: "open" },
    ]);
  });

  it("gives the moderator a hidden room, listed in its section, never to anyone else", async () => {
    const { sectionsFor } = setup();
    expect((await sectionsFor("mod")).list.sections[2]).toEqual({
      name: "Crew",
      rooms: [
        { room: "#earth/crew", type: "members" },
        { room: "#earth/desk", type: "members-write" },
        { room: "#earth/attic", type: "open" },
      ],
    });
    for (const who of [undefined, "stranger", "member"]) {
      expect((await sectionsFor(who)).text).not.toContain("#earth/attic");
    }
  });

  it("asks what each room is to the reader it was asked for, a guest being no one", async () => {
    const asked: [string, string | undefined][] = [];
    const { sectionsFor } = setup(ROLES, (room, who) => {
      asked.push([room, who]);
      return true;
    });
    await sectionsFor("member");
    expect(new Set(asked.map(([, who]) => who))).toEqual(new Set(["member"]));
    asked.length = 0;
    await sectionsFor();
    expect(new Set(asked.map(([, who]) => who))).toEqual(new Set([undefined]));
    // Each room of the world once, none of another world.
    expect(asked.map(([room]) => room).toSorted()).toEqual(
      [
        "#earth",
        "#earth/alpha",
        "#earth/attic",
        "#earth/crew",
        "#earth/desk",
        "#earth/door",
        "#earth/garden",
        "#earth/lounge",
        "#earth/news",
        "#earth/zeta",
      ].toSorted(),
    );
  });

  it("lists the main room first among the others, then by name, however they were made", async () => {
    const { sectionsFor } = setup({ worlds: new Map() }, () => true);
    expect((await sectionsFor(undefined, "earth")).list.sections).toEqual([
      {
        name: null,
        rooms: open(
          "#earth",
          "#earth/alpha",
          "#earth/attic",
          "#earth/crew",
          "#earth/desk",
          "#earth/door",
          "#earth/garden",
          "#earth/lounge",
          "#earth/news",
          "#earth/zeta",
        ),
      },
    ]);
  });

  it("keeps a room whose world has no section in the unnamed group, open when the file does not type it", async () => {
    const { sectionsFor } = setup();
    expect((await sectionsFor(undefined, "bubble")).list).toEqual({
      world: "bubble",
      sections: [{ name: null, rooms: open("#bubble", "#bubble/x") }],
    });
    expect((await sectionsFor(undefined, "moon")).list.sections).toEqual([{ name: null, rooms: open("#moon") }]);
  });

  it("lists a room in its section only, never again among the others", async () => {
    const { sectionsFor } = setup();
    const all = (await sectionsFor("mod")).list.sections.flatMap(({ rooms }) => rooms.map(({ room }) => room));
    expect(all.toSorted()).toEqual([...new Set(all)].toSorted());
  });

  it("lists no room of another world, even one a section names", async () => {
    const roles: Typed = {
      worlds: new Map([["earth", { ...EARTH, sections: [{ name: "Talk", rooms: ["#bubble/x", "#earth"] }] }]]),
    };
    const { sectionsFor } = setup(roles);
    const { text } = await sectionsFor();
    expect(text).not.toContain("#bubble");
    expect(RoomList.parse(JSON.parse(text)).sections[0]).toEqual({ name: "Talk", rooms: open("#earth") });
  });

  it("answers a world the server does not know with no section, as the activity route does", async () => {
    const { ask } = setup();
    const { status, text, response } = await ask("?world=nowhere");
    expect([status, text]).toEqual([200, JSON.stringify({ world: "nowhere", sections: [] })]);
    expect(response.headers.get("cache-control")).toBe("public, max-age=5");
  });

  it("answers a world whose rooms the reader may see none of with no section", async () => {
    const { sectionsFor } = setup(ROLES, () => false);
    expect((await sectionsFor("mod")).list).toEqual({ world: "earth", sections: [] });
  });

  it("answers JSON with the sections' keys in the shape its clients read", async () => {
    const { ask } = setup();
    const { text, response } = await ask("?world=bubble");
    expect(text).toBe(
      JSON.stringify({
        world: "bubble",
        sections: [
          {
            name: null,
            rooms: [
              { room: "#bubble", type: "open" },
              { room: "#bubble/x", type: "open" },
            ],
          },
        ],
      }),
    );
    expect(response.headers.get("content-type")).toMatch(/^application\/json/);
  });

  it("answers 49 sections and the others, the 50 RoomList takes, in the file's order", async () => {
    const made = Array.from({ length: 49 }, (_, i) => `#earth/r${String(i)}`);
    const roles: Typed = {
      worlds: new Map([
        ["earth", { rules: RULES, sections: made.map((room, i) => ({ name: `s${String(i)}`, rooms: [room] })) }],
      ]),
    };
    const { db, sectionsFor } = setup(roles, () => true);
    ensureNamed(
      db,
      made.map((name) => ({ name, world: "earth" })),
      T0,
    );
    const { sections } = (await sectionsFor()).list;
    expect(sections.map(({ name }) => name)).toEqual([...made.map((_, i) => `s${String(i)}`), null]);
    expect(sections.at(0)?.rooms).toEqual(open("#earth/r0"));
    expect(sections.at(-1)?.rooms.at(0)).toEqual({ room: "#earth", type: "open" });
  });
});

describe("GET /api/rooms?world=, its caches", () => {
  it("is public and kept 5 seconds for a guest, private for a session, and varies with the cookie for both", async () => {
    const { ask } = setup();
    const guest = await ask("?world=earth");
    const account = await ask("?world=earth", { cookie: "__Host-session=stranger" });
    expect([
      guest.response.headers.get("cache-control"),
      guest.response.headers.get("vary"),
      account.response.headers.get("cache-control"),
      account.response.headers.get("vary"),
    ]).toEqual(["public, max-age=5", "cookie", "private, max-age=5", "cookie"]);
  });

  it("takes a cookie that names no session, or another cookie's name, for a guest's", async () => {
    const { ask } = setup();
    for (const cookie of ["__Host-session=nobody", "session=mod", "__Host-session=", "x=__Host-session=mod"]) {
      const { response, text } = await ask("?world=earth", { cookie });
      expect(response.headers.get("cache-control")).toBe("public, max-age=5");
      expect(text).not.toContain("#earth/attic");
    }
  });
});

describe("GET /api/rooms?world=, a malformed world", () => {
  it.each([
    ["no world", ""],
    ["an empty world", "?world="],
    ["the activity route's plural", "?worlds=earth"],
    ["the key in capitals", "?World=earth"],
    ["a name in capitals", "?world=Earth"],
    ["a name with a slash", "?world=a%2Fb"],
    ["a room's name", "?world=%23earth"],
    ["a list", "?world=earth,bubble"],
    ["the world twice", "?world=earth&world=bubble"],
    ["the same world twice", "?world=earth&world=earth"],
    ["a name that starts with a hyphen", "?world=-a"],
    ["a name that ends with one", "?world=a-"],
    ["two hyphens in a row", "?world=a--b"],
    ["a space before the name", "?world=%20earth"],
    ["a NUL", "?world=ea%00rth"],
    ["a new line", "?world=earth%0A"],
    ["a name of 65 characters", `?world=${"a".repeat(65)}`],
  ])("refuses %s, with the one answer, kept by no cache", async (_, query) => {
    const { ask } = setup();
    const { status, text, response } = await ask(query);
    expect([status, text]).toEqual([400, REFUSED]);
    expect(String(response.headers.get("cache-control"))).not.toMatch(/public|max-age/);
  });

  it("refuses to a session as to a guest, and takes a name of 64 characters", async () => {
    const { ask } = setup();
    expect((await ask("?world=Earth", { cookie: "__Host-session=mod" })).status).toBe(400);
    expect((await ask(`?world=${"a".repeat(64)}`)).text).toBe(JSON.stringify({ world: "a".repeat(64), sections: [] }));
  });
});

// D394: the Earth's public square: each room's counts, the team's rooms first, the others by use.
describe("GET /api/rooms?world=earth, the public square", () => {
  const MIN = 60_000;
  const DAY = 24 * 60 * MIN;
  const square = (here: Record<string, number> = {}) => {
    const t = setup(
      { worlds: new Map([["earth", { rules: RULES }]]) },
      () => true,
      (room) => here[room],
    );
    const make = (name: string, madeAt: number, { lines = 0, at = T0 - MIN }: { lines?: number; at?: number } = {}) => {
      ensureNamed(t.db, [{ name: `#earth/${name}`, world: "earth" }], madeAt);
      t.db
        .prepare("INSERT INTO earth_rooms (name, maker, created_at) VALUES (?, 'g1x', ?)")
        .run(`#earth/${name}`, madeAt);
      for (let n = 0; n < lines; n += 1)
        t.db
          .prepare("INSERT INTO verdicts (msgid, room, account, action, at) VALUES (?, ?, 'h', 'pass', ?)")
          .run(`${name}-${String(n)}`, `#earth/${name}`, at);
    };
    return { ...t, make };
  };
  const names = async (t: ReturnType<typeof square>) =>
    (await t.sectionsFor()).list.sections.at(-1)?.rooms.map(({ room }) => room);

  it("puts the rooms the moderators made first, by name, then people here now, then messages in 24 h, then the newest", async () => {
    const t = square({ "#earth/few": 1, "#earth/crowd": 5 });
    t.make("old-quiet", T0 - 9 * DAY);
    t.make("new-quiet", T0 - DAY);
    t.make("talky", T0 - 5 * DAY, { lines: 4 });
    t.make("few", T0 - 6 * DAY, { lines: 9 });
    t.make("crowd", T0 - 7 * DAY);
    expect(await names(t)).toEqual([
      "#earth",
      "#earth/alpha",
      "#earth/attic",
      "#earth/crew",
      "#earth/desk",
      "#earth/door",
      "#earth/garden",
      "#earth/lounge",
      "#earth/news",
      "#earth/zeta",
      "#earth/crowd",
      "#earth/few",
      "#earth/talky",
      "#earth/new-quiet",
      "#earth/old-quiet",
    ]);
  });

  it("counts a room's messages of the last 24 hours and the people here, and leaves a zero out", async () => {
    const t = square({ "#earth/crowd": 5 });
    t.make("crowd", T0 - DAY, { lines: 2 });
    t.make("talky", T0 - DAY, { lines: 3, at: T0 - 2 * DAY });
    t.make("calm", T0 - DAY);
    const rooms = (await t.sectionsFor()).list.sections
      .at(-1)
      ?.rooms.filter(({ room }) => /crowd|talky|calm|garden/.test(room));
    expect(rooms).toEqual([
      { room: "#earth/garden", type: "open" },
      { room: "#earth/crowd", type: "open", here: 5, messages: 2 },
      { room: "#earth/calm", type: "open" },
      { room: "#earth/talky", type: "open" },
    ]);
  });

  it("breaks a tie of people, messages and age by name, and keeps the moderators' rooms first past 1,100 rooms", async () => {
    const t = square();
    t.make("zz", T0 - DAY);
    t.make("aa", T0 - DAY);
    expect((await names(t))?.slice(-2)).toEqual(["#earth/aa", "#earth/zz"]);
    for (let n = 0; n < 1200; n += 1) t.make(`m${String(n).padStart(4, "0")}`, T0 - DAY - n);
    const all = await names(t);
    expect(all).toHaveLength(1100);
    expect(all?.slice(0, 3)).toEqual(["#earth", "#earth/alpha", "#earth/attic"]);
  });

  it("keeps another world's rooms by name, whatever its counts", async () => {
    const t = setup(ROLES, visible, () => 9);
    const { list } = await t.sectionsFor(undefined, "bubble");
    expect(list.sections.at(-1)?.rooms.map(({ room }) => room)).toEqual(["#bubble", "#bubble/x"]);
  });
});

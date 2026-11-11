import type { DatabaseSync } from "node:sqlite";
import { Address, SearchPage } from "@gnoworld/schemas";
import { openDatabase } from "@gnoworld/service/db";
import { logger } from "@gnoworld/service/log";
import { afterEach, describe, expect, it } from "vitest";
import { z } from "zod";
import { makeApp } from "../app.ts";
import type { Said } from "../irc/link.ts";
import type { Room } from "../roles/roles.ts";
import { worldOf } from "../rooms/rooms.ts";
import type { Typed } from "../rooms/types.ts";
import { makeSearch, SEARCH_TABLES, type Search } from "./index.ts";
import { searchRoutes } from "./routes.ts";

// Slice 13, B2 (D13917, D13924): GET /api/search answers a reader only with the lines that reader may read, asked again on every
// page and whatever the room was when the line came in (F13700-sec: never `mayRead` alone). docs/plans/search.md §3 B, §4.
const MINUTE = 60_000;
const T0 = Date.parse("2026-11-11T12:00:00.000Z");
const ALICE = Address.parse("g10gh7yq7swv77efwfcqy2znp37cmeughxx3y5tv"); // invited to #bubble/crew
const BOB = Address.parse("g1jg8mtutu9khhfwc4nxmuhcpftf0pajdhfvsqf5"); // an account, invited nowhere
const TEAM = Address.parse("g1m68zzc430znqyxzv6jsfz45hgccacx3mk6qajw");
const TOKENS = new Map([
  ["alice", ALICE],
  ["bob", BOB],
  ["team", TEAM],
]);
const RULES = { bannedWords: [], linksPerMessage: 3, mentionsPerMessage: 5, linksForNewAccount: 2 };
const ORIGIN = "https://gnoworld.test";
const SECRET = "needlesecretzq";

type Kind =
  "open" | "announcement" | "accounts" | "members" | "hidden" | "hidden-members" | "hidden-accounts" | "archived";
const Hit = z.object({
  room: z.string(),
  msgid: z.string(),
  account: z.string(),
  at: z.number(),
  text: z.string(),
  marks: z.array(z.tuple([z.number(), z.number()])),
  link: z.boolean(),
});
const Page = z.object({
  hits: z.array(Hit),
  next: z.string().nullable(),
  total: z.number(),
  capped: z.boolean(),
  partial: z.boolean(),
});

const iso = (at: number): string => new Date(at).toISOString();
const said = (msgid: string, over: Partial<Said> = {}): Said => ({
  room: "#bubble",
  account: ALICE,
  msgid,
  text: `the quorum of ${msgid}`,
  time: iso(T0),
  ...over,
});

const opened: DatabaseSync[] = [];
afterEach(() => {
  for (const db of opened.splice(0)) if (db.isOpen) db.close();
});

// #bubble and #bubble/games are open until a test types them; the others are typed as their names say. The roles object is
// the file's, changed in place as a moderator edits it, after the lines were indexed.
function setup({
  keys,
  query,
  proxy,
  global = 1_000_000,
}: { keys?: number; query?: Search["query"]; proxy?: string; global?: number } = {}) {
  const rooms = new Map<string, Room>([
    ["#bubble/news", { type: "announcement", hidden: false }],
    ["#bubble/club", { type: "accounts", hidden: false }],
    ["#bubble/crew", { type: "members", readers: "crew", hidden: false }],
    ["#bubble/secret", { type: "open", hidden: true }],
  ]);
  const roles: Typed = {
    team: new Set([TEAM]),
    worlds: new Map([["bubble", { rules: RULES, groups: new Map([["crew", new Set([ALICE])]]), rooms }]]),
  };
  const archived = new Set<string>();
  const roomCalls = { count: 0 };
  const db = openDatabase(":memory:", [SEARCH_TABLES]);
  opened.push(db);
  const clock = { now: T0 };
  const real = makeSearch(db, { roles, now: () => clock.now });
  // Lines come in while the room is as the test left it (a room not typed is open): `retype` then changes it.
  const known = ["#bubble", "#bubble/games", "#garden", ...rooms.keys()];
  const search: Search = query === undefined ? real : { ...real, query };
  const lines: string[] = [];
  const log = logger("a-pepper-of-forty-characters-0123456789", (line) => lines.push(line));
  const app = makeApp(log, () => true);
  app.route(
    "/api/search",
    searchRoutes({
      search,
      roles,
      archived: (room) => archived.has(room),
      rooms: (world) => {
        roomCalls.count += 1;
        return known.filter((room) => worldOf(room) === world);
      },
      perSecond: global,
      session: (token) => TOKENS.get(token ?? ""),
      origins: [ORIGIN],
      log,
      now: () => clock.now,
      ...(keys === undefined ? {} : { keys }),
      ...(proxy === undefined ? {} : { proxy }),
    }),
  );
  const retype = (room: string, to: Kind): void => {
    if (to === "archived") archived.add(room);
    else if (to === "hidden") rooms.set(room, { type: "open", hidden: true });
    else if (to === "hidden-members") rooms.set(room, { type: "members", readers: "crew", hidden: true });
    else if (to === "hidden-accounts") rooms.set(room, { type: "accounts", hidden: true });
    else
      rooms.set(
        room,
        to === "members" ? { type: "members", readers: "crew", hidden: false } : { type: to, hidden: false },
      );
  };
  const ask = (
    query: string,
    { who, peer = "203.0.113.7", real }: { who?: string; peer?: string; real?: string } = {},
  ) =>
    app.request(
      `/api/search?${query}`,
      {
        headers: {
          ...(who === undefined ? {} : { cookie: `__Host-session=${who}` }),
          ...(real === undefined ? {} : { "x-real-ip": real }),
        },
      },
      { incoming: { socket: { remoteAddress: peer } } },
    );
  const q = (words: string, extra = "") => `q=${encodeURIComponent(words)}&world=bubble${extra}`;
  const hits = async (query: string, who?: string) => {
    const response = await ask(query, who === undefined ? {} : { who });
    expect(response.status).toBe(200);
    return Page.parse(await response.json());
  };
  const ids = async (query: string, who?: string) => (await hits(query, who)).hits.map(({ msgid }) => msgid).toSorted();
  return { db, search, clock, lines, retype, ask, q, hits, ids, roomCalls };
}

const everyRoom = ["#bubble", "#bubble/games", "#bubble/news", "#bubble/club", "#bubble/crew", "#bubble/secret"];
// One line a room, found by "quorum": the room's name as the id.
function filled() {
  const t = setup();
  for (const room of everyRoom) t.search.add(said(room, { room }));
  return t;
}

describe("the reader's right, for a stranger, a guest and an invited account", () => {
  it("shows a guest the open and announcement rooms' lines, and no accounts room's, no members room's, no hidden room's", async () => {
    const t = filled();
    expect(await t.ids(t.q("quorum"))).toEqual(["#bubble", "#bubble/games", "#bubble/news"]);
  });

  it("shows an account invited nowhere the accounts room's lines too, and still no members room's or hidden room's", async () => {
    const t = filled();
    expect(await t.ids(t.q("quorum"), "bob")).toEqual(["#bubble", "#bubble/club", "#bubble/games", "#bubble/news"]);
  });

  it("shows an invited account no members room's line: a members room is never searched (D13924)", async () => {
    const t = filled();
    expect(await t.ids(t.q("quorum"), "alice")).not.toContain("#bubble/crew");
    expect(await t.ids(t.q("quorum"), "alice")).toEqual(await t.ids(t.q("quorum"), "bob"));
  });

  it("shows the world's moderators and the team no hidden room's line either", async () => {
    const t = filled();
    expect(await t.ids(t.q("quorum"), "team")).not.toContain("#bubble/secret");
  });

  it("answers a members room asked by name with forbidden to a guest and to an account not invited, an empty page to an invited one", async () => {
    const t = filled();
    for (const who of [undefined, "bob"]) {
      const response = await t.ask(t.q("quorum", "&room=%23bubble%2Fcrew"), who === undefined ? {} : { who });
      expect([response.status, await response.json()]).toEqual([403, { error: "forbidden" }]);
    }
    expect((await t.hits(t.q("quorum", "&room=%23bubble%2Fcrew"), "alice")).hits).toEqual([]);
  });

  it("answers an accounts room asked by name with forbidden to a guest and its lines to an account", async () => {
    const t = filled();
    const guest = await t.ask(t.q("quorum", "&room=%23bubble%2Fclub"));
    expect([guest.status, await guest.json()]).toEqual([403, { error: "forbidden" }]);
    expect(await t.ids(t.q("quorum", "&room=%23bubble%2Fclub"), "bob")).toEqual(["#bubble/club"]);
  });

  it("answers a room asked by name with that room's lines alone", async () => {
    const t = filled();
    expect(await t.ids(t.q("quorum", "&room=%23bubble%2Fnews"))).toEqual(["#bubble/news"]);
  });

  it("answers a hidden room asked by name with the empty page of an unknown room, to a guest, an account and the team", async () => {
    const t = filled();
    const unknown = await t.ask(t.q("quorum", "&room=%23bubble%2Fnowhere"));
    const unknownPage = await unknown.text();
    expect(unknown.status).toBe(200);
    for (const who of [undefined, "bob", "alice", "team"]) {
      const response = await t.ask(t.q("quorum", "&room=%23bubble%2Fsecret"), who === undefined ? {} : { who });
      expect([response.status, await response.text()]).toEqual([200, unknownPage]);
    }
    expect(JSON.parse(unknownPage)).toMatchObject({ hits: [], next: null, total: 0, capped: false, partial: false });
  });
});

describe("a room that changes after its lines were indexed (B1 red pass L8, F13700-sec: never mayRead alone)", () => {
  it("hides the lines of a room that became a members room at once, from a guest, an account and an invited account", async () => {
    const t = setup();
    t.search.add(said("m1", { room: "#bubble/games" }));
    expect(await t.ids(t.q("quorum"))).toEqual(["m1"]);
    t.retype("#bubble/games", "members");
    for (const who of [undefined, "bob", "alice", "team"]) expect(await t.ids(t.q("quorum"), who)).toEqual([]);
  });

  it("refuses a members room asked by name after the change, to whoever may not read it", async () => {
    const t = setup();
    t.search.add(said("m1", { room: "#bubble/games" }));
    t.retype("#bubble/games", "members");
    const response = await t.ask(t.q("quorum", "&room=%23bubble%2Fgames"), { who: "bob" });
    expect([response.status, await response.json()]).toEqual([403, { error: "forbidden" }]);
  });

  it("hides the lines of a room that became hidden at once, from everyone, the team included", async () => {
    const t = setup();
    t.search.add(said("m1", { room: "#bubble/games" }));
    t.retype("#bubble/games", "hidden");
    for (const who of [undefined, "bob", "alice", "team"]) expect(await t.ids(t.q("quorum"), who)).toEqual([]);
  });

  it("hides the lines of an archived room at once, from everyone", async () => {
    const t = setup();
    t.search.add(said("m1", { room: "#bubble/games" }));
    t.retype("#bubble/games", "archived");
    for (const who of [undefined, "bob", "alice", "team"]) expect(await t.ids(t.q("quorum"), who)).toEqual([]);
    expect((await t.hits(t.q("quorum", "&room=%23bubble%2Fgames"), "team")).hits).toEqual([]);
  });

  it("hides the lines of a room that became an accounts room from a guest alone", async () => {
    const t = setup();
    t.search.add(said("m1", { room: "#bubble/games" }));
    t.retype("#bubble/games", "accounts");
    expect(await t.ids(t.q("quorum"))).toEqual([]);
    expect(await t.ids(t.q("quorum"), "bob")).toEqual(["m1"]);
  });

  it("asks the right again on every page: a cursor taken while the room was open gives nothing once it is a members room", async () => {
    const t = setup();
    for (let i = 0; i < 25; i++)
      t.search.add(said(`m${String(i).padStart(2, "0")}`, { room: "#bubble/games", time: iso(T0 + i) }));
    const first = await t.hits(t.q("quorum"));
    expect([first.hits.length, first.next === null]).toEqual([20, false]);
    t.retype("#bubble/games", "members");
    const second = await t.hits(t.q("quorum", `&before=${encodeURIComponent(first.next ?? "")}`));
    expect(second).toMatchObject({ hits: [], next: null });
  });
});

describe("the request: world, q and the cursor", () => {
  it("refuses a missing world, a world of no slug, two worlds, and a room of another world", async () => {
    const t = filled();
    for (const query of [
      "q=quorum",
      "q=quorum&world=",
      "q=quorum&world=Bub%20ble",
      "q=quorum&world=bubble&world=garden",
      "q=quorum&world=bubble&room=%23garden",
      "q=quorum&world=bubble&room=bubble",
      "q=quorum&world=bubble&room=%23bubble&room=%23bubble%2Fnews",
    ]) {
      const response = await t.ask(query);
      expect([query, response.status, await response.json()]).toEqual([query, 400, { error: "refused" }]);
    }
  });

  it("answers a world the server does not know with the same empty page as a hidden room's", async () => {
    const t = filled();
    const response = await t.ask("q=quorum&world=nowhere");
    expect([response.status, await response.json()]).toEqual([
      200,
      { hits: [], next: null, total: 0, capped: false, partial: false },
    ]);
  });

  it.each([
    ["one character", "a"],
    ["101 characters", "a".repeat(101)],
    ["only spaces", "      "],
    ["a control character", "quo\u0007rum"],
    ["a NUL", "quo\u0000rum"],
  ])("refuses a q of %s", async (_, words) => {
    const response = await filled().ask(`q=${encodeURIComponent(words)}&world=bubble`);
    expect([response.status, await response.json()]).toEqual([400, { error: "refused" }]);
  });

  it("refuses no q and a q given twice", async () => {
    const t = filled();
    for (const query of ["world=bubble", "q=quorum&q=zebra&world=bubble"])
      expect((await t.ask(query)).status).toBe(400);
  });

  it("answers a q of 2 characters and one of 100 characters", async () => {
    const t = setup();
    t.search.add(said("m1", { text: "go to the gov" }));
    t.search.add(said("m2", { text: `${"w".repeat(100)} here` }));
    expect(await t.ids(t.q("go"))).toEqual(["m1"]);
    expect(await t.ids(t.q("w".repeat(100)))).toEqual(["m2"]);
  });

  it.each([
    ["negative", "-1"],
    ["text", "abc"],
    ["the old pair of numbers", "5:5"],
    ["a fraction", "1.5"],
    ["hexadecimal", "0x10"],
    ["huge", "99999999999999999999"],
    ["16 digits", "9".repeat(16)],
    ["a space", " 5"],
    ["empty", ""],
  ])("refuses a cursor that is %s", async (_, cursor) => {
    const t = filled();
    const response = await t.ask(t.q("quorum", `&before=${encodeURIComponent(cursor)}`));
    expect([response.status, await response.json()]).toEqual([400, { error: "refused" }]);
  });

  it("pages newest arrival first by row, 20 a page, with no line twice and none lost, ties on a time included", async () => {
    const t = setup();
    for (let i = 0; i < 45; i++)
      t.search.add(said(`m${String(i).padStart(2, "0")}`, { time: iso(T0 + Math.floor(i / 3)) }));
    const seen: string[] = [];
    let next: string | null = "";
    let pages = 0;
    while (next !== null && pages < 5) {
      const page = await t.hits(t.q("quorum", next === "" ? "" : `&before=${encodeURIComponent(next)}`));
      seen.push(...page.hits.map(({ msgid }) => msgid));
      next = page.next;
      pages += 1;
    }
    expect([pages, seen.length, new Set(seen).size]).toEqual([3, 45, 45]);
    expect(seen).toEqual(Array.from({ length: 45 }, (_, i) => `m${String(44 - i).padStart(2, "0")}`));
  });

  it("counts at most 1,000: a bounded total and its flag, never every line", async () => {
    const t = setup();
    for (let i = 0; i < 1200; i++) t.search.add(said(`m${String(i)}`, { time: iso(T0 + i) }));
    const page = await t.hits(t.q("quorum"));
    expect([page.hits.length, page.total, page.capped]).toEqual([20, 1000, true]);
    const small = setup();
    for (let i = 0; i < 30; i++) small.search.add(said(`m${String(i)}`));
    expect(await small.hits(small.q("quorum"))).toMatchObject({ total: 30, capped: false });
  });

  it("answers what SearchPage parses, a hit with exactly its room, id, account, time, snippet, marks and link flag", async () => {
    const t = setup();
    t.search.add(said("m1", { text: "see https://gno.land about the quorum" }));
    const response = await t.ask(t.q("quorum"));
    expect(response.headers.get("cache-control")).toBe("no-store");
    expect(response.headers.get("content-type")).toMatch(/^application\/json/);
    const raw: unknown = await response.json();
    expect(Object.keys(Page.parse(raw).hits[0] ?? {}).toSorted()).toEqual([
      "account",
      "at",
      "link",
      "marks",
      "msgid",
      "room",
      "text",
    ]);
    expect(Object.keys(z.record(z.string(), z.unknown()).parse(raw)).toSorted()).toEqual([
      "capped",
      "hits",
      "next",
      "partial",
      "total",
    ]);
    const page = SearchPage.parse(raw);
    expect(page.hits).toEqual([
      {
        room: "#bubble",
        msgid: "m1",
        account: ALICE,
        at: T0,
        text: "see https://gno.land about the quorum",
        marks: [[31, 37]],
        link: true,
      },
    ]);
  });
});

describe("the query's operators are words, never FTS5 syntax (B1 security: quoted words only)", () => {
  const lineOf = (text: string) => {
    const t = setup();
    t.search.add(said("m1", { text }));
    t.search.add(said("m2", { text: "nothing alike" }));
    return t;
  };

  it.each([
    '""',
    "**",
    "quorum*",
    '"quorum',
    'quorum"',
    '""x',
    'a"',
    "NEAR(",
    "NEAR(a b)",
    "a OR",
    "x:y",
    "text:quorum",
    "-quorum",
    "^quorum",
    "((",
    "))",
    "{}",
    "a AND NOT b",
    "quor*um",
    "''",
    "\\\\",
    "%%",
    "__",
  ])("answers 200 and never a server error for %j", async (words) => {
    const t = lineOf("the quorum is met");
    const response = await t.ask(t.q(words));
    expect(response.status).toBe(200);
    Page.parse(await response.json());
  });

  it("finds a prefix typed with a star as it finds the word typed whole, and the star holds no other meaning", async () => {
    const t = lineOf("the quorum is met");
    expect(await t.ids(t.q("quor*"))).toEqual(["m1"]);
    expect(await t.ids(t.q("quorum"))).toEqual(["m1"]);
    expect(await t.ids(t.q("*quor"))).toEqual(["m1"]);
  });

  it("does not take `text:` for a column filter, nor a minus for NOT: the line holding the word is found", async () => {
    const t = lineOf("the quorum is met");
    expect(await t.ids(t.q("-quorum"))).toEqual(["m1"]);
    expect(await t.ids(t.q("text:quorum"))).toEqual([]);
  });

  it("takes OR, NOT and NEAR for words: a line holding them is found by them, and every word must be there", async () => {
    const t = setup();
    t.search.add(said("m1", { text: "the quorum or zebra" }));
    t.search.add(said("m2", { text: "the quorum alone" }));
    t.search.add(said("m3", { text: "a zebra alone" }));
    t.search.add(said("m4", { text: "near not quorum" }));
    expect(await t.ids(t.q("quorum OR zebra"))).toEqual(["m1"]);
    expect(await t.ids(t.q("quorum zebra"))).toEqual(["m1"]);
    expect(await t.ids(t.q("near NOT quorum"))).toEqual(["m4"]);
    expect(await t.ids(t.q("NEAR( quorum"))).toEqual(["m4"]);
  });

  it("holds an empty word and a lone quote as nothing: the other words still answer", async () => {
    const t = lineOf("the quorum is met");
    expect(await t.ids(t.q('quorum "" '))).toEqual(["m1"]);
    expect(await t.ids(t.q('" quorum'))).toEqual(["m1"]);
  });

  it("answers an empty page, never every line, for a q of only stop characters", async () => {
    const t = lineOf("the quorum is met");
    for (const words of ["**", "--", '"" ""', "!?", "((", "~~"]) {
      expect([words, (await t.hits(t.q(words))).hits]).toEqual([words, []]);
    }
  });

  it("holds the first 8 words alone: a line with the first 8 is found by 9, one lacking a first word is not", async () => {
    const t = setup();
    t.search.add(said("m1", { text: "w1 w2 w3 w4 w5 w6 w7 w8" }));
    t.search.add(said("m2", { text: "w2 w3 w4 w5 w6 w7 w8 w9" }));
    expect(await t.ids(t.q("w1 w2 w3 w4 w5 w6 w7 w8 w9"))).toEqual(["m1"]);
  });

  it("finds an emoji's neighbours, an RTL text and an accent-less word, and answers 200 to an emoji alone", async () => {
    const t = setup();
    t.search.add(said("m1", { text: "launch \u{1F680} now" }));
    t.search.add(said("m2", { text: "שלום עולם" }));
    t.search.add(said("m3", { text: "un café" }));
    expect(await t.ids(t.q("launch \u{1F680}"))).toEqual(["m1"]);
    expect(await t.ids(t.q("שלום"))).toEqual(["m2"]);
    expect(await t.ids(t.q("cafe"))).toEqual(["m3"]);
    expect((await t.ask(t.q("\u{1F680}\u{1F680}"))).status).toBe(200);
  });
});

describe("the snippet: plain text of 240 characters at most, with the marks as offsets", () => {
  it("cuts a long line around the match, at most 240 characters, the marked range being the word as typed", async () => {
    const t = setup();
    const text = `${"lorem ipsum ".repeat(35)}quorum ${"dolor sit ".repeat(35)}`;
    t.search.add(said("m1", { text }));
    const [hit] = (await t.hits(t.q("quorum"))).hits;
    expect(hit?.text.length).toBeLessThanOrEqual(240);
    expect(text).toContain(hit?.text ?? "\0");
    const [from = 0, to = 0] = hit?.marks[0] ?? [];
    expect(hit?.text.slice(from, to).toLowerCase()).toBe("quorum");
  });

  it("marks every typed word in the snippet, in order, each inside the text", async () => {
    const t = setup();
    t.search.add(said("m1", { text: "the Quorum meets the treasury" }));
    const [hit] = (await t.hits(t.q("quor treas"))).hits;
    expect(hit?.marks.map(([a, b]) => hit.text.slice(a, b).toLowerCase())).toEqual(["quorum", "treasury"]);
  });

  it("holds a short line whole", async () => {
    const t = setup();
    t.search.add(said("m1", { text: "the quorum" }));
    expect((await t.hits(t.q("quorum"))).hits[0]?.text).toBe("the quorum");
  });

  it("never cuts an emoji in two", async () => {
    const t = setup();
    t.search.add(said("m1", { text: `${"\u{1F600}".repeat(200)} quorum ${"\u{1F600}".repeat(200)}` }));
    const [hit] = (await t.hits(t.q("quorum"))).hits;
    expect(hit?.text.length).toBeLessThanOrEqual(240);
    expect(hit?.text).not.toMatch(/[\ud800-\udbff](?![\udc00-\udfff])|(?<![\ud800-\udbff])[\udc00-\udfff]/);
    expect(hit?.text).toContain("quorum");
  });

  it("answers the line's own characters, never HTML of the server's: no markup added, none of the line's escaped", async () => {
    const t = setup();
    const text = '<b>quorum</b> & <script>alert(1)</script> "quoted"';
    t.search.add(said("m1", { text }));
    const response = await t.ask(t.q("quorum"));
    const body = await response.text();
    expect(body).not.toMatch(/<mark|&lt;|&amp;|&#/);
    expect(Page.parse(JSON.parse(body)).hits[0]?.text).toBe(text);
  });
});

describe("the filters: from, link and the time", () => {
  function two() {
    const t = setup();
    t.search.add(said("a1", { account: ALICE, time: iso(T0 - 2 * MINUTE), text: "the quorum https://gno.land" }));
    t.search.add(said("b1", { account: BOB, time: iso(T0 - MINUTE) }));
    t.search.add(said("a2", { account: ALICE, time: iso(T0) }));
    return t;
  }

  it("answers from an account the lines of that account, which are those of the unfiltered answer written by it", async () => {
    const t = two();
    const all = (await t.hits(t.q("quorum"))).hits;
    const from = (await t.hits(t.q("quorum", `&from=${ALICE}`))).hits;
    expect(from.map(({ msgid }) => msgid)).toEqual(["a2", "a1"]);
    expect(from).toEqual(all.filter(({ account }) => account === ALICE));
  });

  it("gives the same answer with and without `from` to a reader who may read, and nothing to one who may not", async () => {
    const t = filled();
    expect(await t.ids(t.q("quorum", `&from=${ALICE}`), "bob")).toEqual(await t.ids(t.q("quorum"), "bob"));
    for (const query of [t.q("quorum", "&room=%23bubble%2Fcrew"), t.q("quorum", "&room=%23bubble%2Fclub")]) {
      const plain = await t.ask(query);
      const filtered = await t.ask(`${query}&from=${ALICE}`);
      expect([filtered.status, await filtered.text()]).toEqual([plain.status, await plain.text()]);
      expect(plain.status).toBe(403);
    }
  });

  it("refuses a `from` that is no address, and `from:anon/...`, which names no one person (names are minted again after 24 h)", async () => {
    const t = two();
    for (const from of ["anon/kai", "anon%2Fkai", "kai", "g1nope", `${ALICE}%20`, ""]) {
      const response = await t.ask(t.q("quorum", `&from=${from}`));
      expect([from, response.status]).toEqual([from, 400]);
    }
  });

  it("keeps the lines that hold a link with link=1, and refuses another value", async () => {
    const t = two();
    expect(await t.ids(t.q("quorum", "&link=1"))).toEqual(["a1"]);
    for (const value of ["0", "true", "yes", ""])
      expect((await t.ask(t.q("quorum", `&link=${value}`))).status).toBe(400);
  });

  it("keeps the lines from `since` and until `until`, ISO times, and refuses a time that is none", async () => {
    const t = two();
    expect(await t.ids(t.q("quorum", `&since=${encodeURIComponent(iso(T0 - MINUTE))}`))).toEqual(["a2", "b1"]);
    expect(await t.ids(t.q("quorum", `&until=${encodeURIComponent(iso(T0 - MINUTE))}`))).toEqual(["a1", "b1"]);
    for (const value of ["yesterday", "-1", "2026-13-45T00:00:00.000Z", ""]) {
      expect((await t.ask(t.q("quorum", `&since=${encodeURIComponent(value)}`))).status).toBe(400);
    }
  });
});

describe("the limits: 20 a minute a visitor, 60 an account, the keys bounded", () => {
  it("answers the 21st request of a visitor in a minute with too_many, the 20th still with its page", async () => {
    const t = filled();
    for (let i = 0; i < 20; i++) expect((await t.ask(t.q("quorum"))).status).toBe(200);
    const refused = await t.ask(t.q("quorum"));
    expect([refused.status, await refused.json()]).toEqual([429, { error: "too_many" }]);
  });

  it("opens the window again a minute after it began, and counts another visitor apart", async () => {
    const t = filled();
    for (let i = 0; i < 21; i++) await t.ask(t.q("quorum"));
    expect((await t.ask(t.q("quorum"), { peer: "203.0.113.8" })).status).toBe(200);
    t.clock.now += MINUTE;
    expect((await t.ask(t.q("quorum"))).status).toBe(200);
  });

  it("counts a refused request too: 20 bad ones and the 21st is a 429, not a 400", async () => {
    const t = filled();
    for (let i = 0; i < 20; i++) expect((await t.ask("world=bubble")).status).toBe(400);
    expect((await t.ask("world=bubble")).status).toBe(429);
  });

  it("gives an account 60 a minute of its own, counted by its address and not by its visitor's address", async () => {
    const t = filled();
    for (let i = 0; i < 20; i++) await t.ask(t.q("quorum"));
    expect((await t.ask(t.q("quorum"))).status).toBe(429);
    for (let i = 0; i < 60; i++) expect((await t.ask(t.q("quorum"), { who: "bob" })).status).toBe(200);
    expect((await t.ask(t.q("quorum"), { who: "bob" })).status).toBe(429);
    expect((await t.ask(t.q("quorum"), { who: "alice", peer: "203.0.113.7" })).status).toBe(200);
  });

  it("does not let a cookie that is no session be a key of its own: it counts as its visitor", async () => {
    const t = filled();
    for (let i = 0; i < 20; i++) await t.ask(t.q("quorum"), { who: `forged${String(i)}` });
    expect((await t.ask(t.q("quorum"), { who: "forged-again" })).status).toBe(429);
  });

  it("holds the keys to its cap: a visitor pushed out by the others starts a fresh window", async () => {
    const t = setup({ keys: 3 });
    t.search.add(said("m1"));
    for (let i = 0; i < 21; i++) await t.ask(t.q("quorum"));
    for (const peer of ["203.0.113.21", "203.0.113.22", "203.0.113.23"]) await t.ask(t.q("quorum"), { peer });
    expect((await t.ask(t.q("quorum"))).status).toBe(200);
  });
});

describe("nothing of the query is kept or leaked", () => {
  it("logs a refusal as a route, a status and a cause, and never the words searched, whatever the answer", async () => {
    const t = filled();
    for (let i = 0; i < 20; i++) await t.ask(t.q(SECRET));
    await t.ask(t.q(SECRET, "&room=%23bubble%2Fcrew"));
    await t.ask(t.q(SECRET, "&room=%23bubble%2Fclub&from=anon%2Fkai"));
    await t.ask(`q=${SECRET}`);
    expect(t.lines.some((line) => line.includes('"search_refused"'))).toBe(true);
    expect(t.lines.filter((line) => line.includes(SECRET))).toEqual([]);
  });

  it("answers an index that fails with not_ready, logging its name and never the words or the error's message", async () => {
    const t = setup({
      query: () => {
        throw new Error(`the database said: ${SECRET}`);
      },
    });
    const response = await t.ask(t.q(SECRET));
    expect([response.status, await response.json()]).toEqual([503, { error: "not_ready" }]);
    expect(t.lines.some((line) => line.includes('"search_refused"') || line.includes('"search_failed"'))).toBe(true);
    expect(t.lines.filter((line) => line.includes(SECRET))).toEqual([]);
  });

  it("answers an edited line with its text alone: no edit id, no edit's text, in the answer", async () => {
    const t = setup();
    t.search.add(said("m1", { text: "first words" }));
    t.search.edited(said("edit-secret-id", { edits: "m1", text: "second words" }));
    const body = await (await t.ask(t.q("second"))).text();
    expect(Page.parse(JSON.parse(body)).hits.map(({ msgid, text }) => [msgid, text])).toEqual([["m1", "second words"]]);
    expect(body).not.toContain("edit-secret-id");
    expect((await t.hits(t.q("first"))).hits).toEqual([]);
  });
});

const OPEN_THEN = ["members", "hidden", "archived", "accounts"] as const;
const READERS = [undefined, "bob", "alice", "team"] as const;
const PARAMS = [
  "",
  `&from=${ALICE}`,
  "&link=1",
  `&since=${encodeURIComponent(iso(T0 - 1))}`,
  `&until=${encodeURIComponent(iso(T0 + 1))}`,
  "&before=9999999999999",
  `&from=${ALICE}&link=1&since=${encodeURIComponent(iso(T0 - 1))}&until=${encodeURIComponent(iso(T0 + 1))}&before=9999999999999`,
];

describe("the room's right holds whatever narrows the search (F13753, F13754, F13755)", () => {
  it.each(OPEN_THEN)(
    "finds no line of a room retyped %s with any of from, link, since, until and a cursor, for any reader",
    async (to) => {
      const t = setup();
      t.search.add(said("m1", { room: "#bubble/games", text: "the quorum https://gno.land" }));
      t.retype("#bubble/games", to);
      const bobSees = to === "accounts";
      for (const extra of PARAMS) {
        for (const who of READERS) {
          const seen = (await t.hits(t.q("quorum", extra), who)).hits.map(({ msgid }) => msgid);
          expect([to, extra, who, seen]).toEqual([to, extra, who, bobSees && who !== undefined ? ["m1"] : []]);
        }
      }
    },
  );

  async function sameAsUnknown(t: ReturnType<typeof setup>, room: string, readers: readonly (string | undefined)[]) {
    const unknown = await (await t.ask(t.q("quorum", "&room=%23bubble%2Fnowhere"))).text();
    for (const who of readers) {
      const response = await t.ask(
        t.q("quorum", `&room=${encodeURIComponent(room)}`),
        who === undefined ? {} : { who },
      );
      expect([room, who, response.status, await response.text()]).toEqual([room, who, 200, unknown]);
    }
  }

  it("answers a room indexed while open and hidden since, asked by name, as an unknown room, to every reader", async () => {
    const t = setup();
    t.search.add(said("m1", { room: "#bubble/games" }));
    t.retype("#bubble/games", "hidden");
    await sameAsUnknown(t, "#bubble/games", READERS);
  });

  it("answers a room indexed while open and archived since, asked by name, as an unknown room, to every reader", async () => {
    const t = setup();
    t.search.add(said("m1", { room: "#bubble/games" }));
    t.retype("#bubble/games", "archived");
    await sameAsUnknown(t, "#bubble/games", READERS);
  });

  it("answers a hidden members room and a hidden accounts room, asked by name, as an unknown room, never forbidden", async () => {
    const t = setup();
    t.retype("#bubble/crew", "hidden-members");
    t.retype("#bubble/club", "hidden-accounts");
    t.retype("#bubble/news", "hidden");
    await sameAsUnknown(t, "#bubble/crew", READERS);
    await sameAsUnknown(t, "#bubble/club", READERS);
    await sameAsUnknown(t, "#bubble/news", READERS);
  });

  it("answers an archived members room, asked by name, as an unknown room, to a reader who may not read it too", async () => {
    const t = setup();
    t.retype("#bubble/crew", "archived");
    await sameAsUnknown(t, "#bubble/crew", READERS);
  });
});

describe("the work and the pages", () => {
  it("finds a line by eight one-letter prefixes", async () => {
    const t = setup();
    t.search.add(said("m1", { text: "a b c d e f g h" }));
    expect(await t.ids(t.q("a b c d e f g h"))).toEqual(["m1"]);
  });

  it("closes the last page: exactly 20 lines is one page with no next, 40 two pages and no third", async () => {
    const t = setup();
    for (let i = 0; i < 20; i++) t.search.add(said(`m${String(i)}`, { time: iso(T0 + i) }));
    expect((await t.hits(t.q("quorum"))).next).toBeNull();
    for (let i = 20; i < 40; i++) t.search.add(said(`m${String(i)}`, { time: iso(T0 + i) }));
    const first = await t.hits(t.q("quorum"));
    const second = await t.hits(t.q("quorum", `&before=${encodeURIComponent(first.next ?? "")}`));
    expect([first.hits.length, second.hits.length, second.next]).toEqual([20, 20, null]);
  });

  it("says capped for 1,001 lines and not for 1,000, and counts the whole match set on every page", async () => {
    const t = setup();
    for (let i = 0; i < 1000; i++) t.search.add(said(`m${String(i)}`, { time: iso(T0 + i) }));
    const first = await t.hits(t.q("quorum"));
    expect([first.total, first.capped]).toEqual([1000, false]);
    const second = await t.hits(t.q("quorum", `&before=${encodeURIComponent(first.next ?? "")}`));
    expect([second.total, second.capped]).toEqual([1000, false]);
    t.search.add(said("m1000", { time: iso(T0 + 1000) }));
    expect(await t.hits(t.q("quorum", `&before=${encodeURIComponent(first.next ?? "")}`))).toMatchObject({
      total: 1000,
      capped: true,
    });
  });

  it("never reads another world's rows, whatever the cursor", async () => {
    const t = setup();
    t.search.add(said("g1", { room: "#garden", time: iso(T0 + 5) }));
    t.search.add(said("m1", { time: iso(T0) }));
    expect(await t.ids(t.q("quorum", "&before=9999999999999"))).toEqual(["m1"]);
    expect(await t.ids(`q=quorum&world=garden&before=9999999999999`)).toEqual(["g1"]);
  });

  it("marks the words within 240 characters of the first, inside the text, not overlapping, and a prefix only at a word's start", async () => {
    const t = setup();
    t.search.add(said("m1", { text: `quorum ${"x ".repeat(150)} treasury` }));
    t.search.add(said("m2", { text: "the quorum um" }));
    const far = (await t.hits(t.q("quorum treasury"))).hits.find(({ msgid }) => msgid === "m1");
    expect(far?.marks).toEqual([[0, 6]]);
    const [hit] = (await t.hits(t.q("quorum"))).hits.filter(({ msgid }) => msgid === "m1");
    expect(hit?.marks).toEqual([[0, 6]]);
    const um = (await t.hits(t.q("um"))).hits.find(({ msgid }) => msgid === "m2");
    expect(um?.marks.map(([a, b]) => um.text.slice(a, b))).toEqual(["um"]);
  });

  it("marks the whole of an accented word found by its plain spelling, and keeps every mark in [0, length]", async () => {
    const t = setup();
    t.search.add(said("m1", { text: "un café noir" }));
    const [hit] = (await t.hits(t.q("cafe"))).hits;
    expect(hit?.marks).toEqual([[3, 7]]);
    for (const [a, b] of hit?.marks ?? [])
      expect([a >= 0, b <= (hit?.text.length ?? 0), a < b]).toEqual([true, true, true]);
  });
});

describe("the query's length is the normalised one, and its characters (F13763)", () => {
  it.each([
    ["U+FDFA six times, 108 characters once folded", "\uFDFA".repeat(6), 400],
    ["an ellipsis 34 times, 102 once folded", "\u2026".repeat(34), 400],
    ["an ellipsis 33 times, 99 once folded", "\u2026".repeat(33), 200],
    ["a tab, a newline and a carriage return, which are spaces", "quorum\tmet\nand\rgo", 200],
    ["a DEL", "quo\u007frum", 400],
    ["a C1 control", "quo\u0085rum", 400],
  ])("answers a q of %s with %i", async (_, words, status) => {
    const response = await filled().ask(`q=${encodeURIComponent(words)}&world=bubble`);
    expect(response.status).toBe(status);
  });

  it("reads a tab, a newline and a carriage return as the spaces between words", async () => {
    const t = setup();
    t.search.add(said("m1", { text: "the quorum is met" }));
    expect(await t.ids(t.q("quorum\tis\nmet"))).toEqual(["m1"]);
  });
});

describe("the times, the visitor behind a proxy and the answers' headers (F13758, F13764, F13766, F13767)", () => {
  it.each(["2026", "12", "2026-11-11"])("refuses a since of %s", async (since) => {
    expect((await filled().ask(`q=quorum&world=bubble&since=${since}`)).status).toBe(400);
  });

  it("takes a time with an offset for the instant it names", async () => {
    const t = setup();
    t.search.add(said("m1", { time: iso(T0) }));
    expect(await t.ids(t.q("quorum", `&since=${encodeURIComponent("2026-11-11T13:00:00.000+01:00")}`))).toEqual(["m1"]);
    expect(await t.ids(t.q("quorum", `&since=${encodeURIComponent("2026-11-11T13:00:00.001+01:00")}`))).toEqual([]);
  });

  it("keeps a window to the millisecond: 59,999 ms after its start it is still full, 60,000 it opens", async () => {
    const t = filled();
    for (let i = 0; i < 20; i++) await t.ask(t.q("quorum"));
    t.clock.now += MINUTE - 1;
    expect((await t.ask(t.q("quorum"))).status).toBe(429);
    t.clock.now += 1;
    expect((await t.ask(t.q("quorum"))).status).toBe(200);
  });

  it("counts a visitor by the proxy's header when the peer is the proxy, and by the peer when it is not or none is set", async () => {
    const t = setup({ proxy: "203.0.113.7" });
    t.search.add(said("m1"));
    for (let i = 0; i < 20; i++) await t.ask(t.q("quorum"), { real: "198.51.100.1" });
    expect((await t.ask(t.q("quorum"), { real: "198.51.100.1" })).status).toBe(429);
    expect((await t.ask(t.q("quorum"), { real: "198.51.100.2" })).status).toBe(200);
    expect((await t.ask(t.q("quorum"), { real: "198.51.100.3", peer: "203.0.113.99" })).status).toBe(200);
    expect((await t.ask(t.q("quorum"), { real: "198.51.100.4", peer: "203.0.113.99" })).status).toBe(200);
    const plain = setup();
    for (let i = 0; i < 20; i++) await plain.ask(plain.q("quorum"), { real: `198.51.100.${String(i)}` });
    expect((await plain.ask(plain.q("quorum"), { real: "198.51.100.200" })).status).toBe(429);
  });

  it("holds the account limiter's keys to its cap too: an account pushed out by two others starts a fresh window", async () => {
    const t = setup({ keys: 2 });
    for (let i = 0; i < 60; i++) await t.ask(t.q("quorum"), { who: "alice" });
    expect((await t.ask(t.q("quorum"), { who: "alice" })).status).toBe(429);
    await t.ask(t.q("quorum"), { who: "bob" });
    await t.ask(t.q("quorum"), { who: "team" });
    expect((await t.ask(t.q("quorum"), { who: "alice" })).status).toBe(200);
  });

  it("sets no-store on a forbidden and on a too_many answer too", async () => {
    const t = filled();
    const forbidden = await t.ask(t.q("quorum", "&room=%23bubble%2Fcrew"));
    expect([forbidden.status, forbidden.headers.get("cache-control")]).toEqual([403, "no-store"]);
    for (let i = 0; i < 20; i++) await t.ask(t.q("quorum"));
    const limited = await t.ask(t.q("quorum"));
    expect([limited.status, limited.headers.get("cache-control")]).toEqual([429, "no-store"]);
  });
});

describe("the cost at the cap (F13770, F13772)", () => {
  it("asks the world's rooms once a request, with or without a room named", async () => {
    const t = filled();
    await t.ask(t.q("quorum"));
    expect(t.roomCalls.count).toBe(1);
    await t.ask(t.q("quorum", "&room=%23bubble%2Fnews"));
    expect(t.roomCalls.count).toBe(2);
  });

  it("pages by arrival: a late older line is on the first page, the cursor is a row number alone", async () => {
    const t = setup();
    for (let i = 0; i < 20; i++) t.search.add(said(`m${String(i).padStart(2, "0")}`, { time: iso(T0 + i) }));
    t.search.add(said("late", { time: iso(T0 - 9999) }));
    const first = await t.hits(t.q("quorum"));
    expect(first.hits[0]?.msgid).toBe("late");
    expect(first.next).toMatch(/^\d{1,15}$/);
    const second = await t.hits(t.q("quorum", `&before=${first.next ?? ""}`));
    expect(second.hits.map(({ msgid }) => msgid)).toEqual(["m00"]);
  });

  it("finds a short word whole only, and marks it whole", async () => {
    const t = setup();
    t.search.add(said("m1", { text: "the quorum" }));
    t.search.add(said("m2", { text: "qu is short" }));
    expect(await t.ids(t.q("qu"))).toEqual(["m2"]);
    expect(await t.ids(t.q("quo"))).toEqual(["m1"]);
    const [hit] = (await t.hits(t.q("qu"))).hits;
    expect(hit?.marks).toEqual([[0, 2]]);
  });

  it("limits every visitor together to 10 searches a second: the 11th, from another visitor, is too_many", async () => {
    const t = setup({ global: 10 });
    t.search.add(said("m1"));
    for (let i = 0; i < 10; i++)
      expect((await t.ask(t.q("quorum"), { peer: `203.0.113.${String(i + 10)}` })).status).toBe(200);
    const refused = await t.ask(t.q("quorum"), { peer: "203.0.113.99" });
    expect([refused.status, await refused.json(), refused.headers.get("cache-control")]).toEqual([
      429,
      { error: "too_many" },
      "no-store",
    ]);
    t.clock.now += 1000;
    expect((await t.ask(t.q("quorum"), { peer: "203.0.113.99" })).status).toBe(200);
  });

  it("does not spend the global budget on a request its own visitor's limit refused", async () => {
    const t = setup({ global: 25 });
    t.search.add(said("m1"));
    for (let i = 0; i < 21; i++) await t.ask(t.q("quorum"));
    for (let i = 0; i < 5; i++) expect((await t.ask(t.q("quorum"), { peer: "203.0.113.50" })).status).toBe(200);
    expect((await t.ask(t.q("quorum"), { peer: "203.0.113.51" })).status).toBe(429);
  });
});

describe("the bound: the newest 5,000 matches (F13770)", () => {
  it("says partial from 5,001 matches and not at 5,000, and the filters then run over the newest 5,000 alone", async () => {
    const t = setup();
    t.search.add(said("old", { account: BOB, text: "quorum" }));
    for (let i = 0; i < 4999; i++)
      t.search.add(
        said(`m${String(i)}`, { room: ["#bubble", "#bubble/games", "#bubble/news"][i % 3] ?? "", time: iso(T0 + i) }),
      );
    expect(await t.hits(t.q("quorum"))).toMatchObject({ partial: false, capped: true });
    expect(await t.ids(t.q("quorum", `&from=${BOB}`))).toEqual(["old"]);
    t.search.add(said("m5000", { time: iso(T0 + 5000) }));
    expect(await t.hits(t.q("quorum"))).toMatchObject({ partial: true });
    // The oldest match fell out of the newest 5,000: ceiling, said by `partial`.
    expect(await t.hits(t.q("quorum", `&from=${BOB}`))).toMatchObject({ hits: [], total: 0, partial: true });
  });
});

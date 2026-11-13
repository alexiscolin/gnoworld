import type { DatabaseSync } from "node:sqlite";
import { Address, EXPLAIN_VERSION, type JarvisAnswer, type JarvisAsk, type JarvisPaidAnswer } from "@gnoworld/schemas";
import { openDatabase } from "@gnoworld/service/db";
import { logger } from "@gnoworld/service/log";
import { afterEach, describe, expect, it, vi } from "vitest";
import { makeApp } from "../app.ts";
import { migrations } from "../migrations.ts";
import { makeRetention } from "../retention/retention.ts";
import { askRoutes } from "./ask.ts";
import { DAY_TABLES, makeDay } from "./day.ts";
import { makeQuota, QUOTA_TABLES } from "./quota.ts";
import { makeServed, servedKey } from "./served.ts";
import { EXPLAIN_MS, explainKey, HERE_MS, hereKey, KEPT_MAX, KEPT_TABLES, keptKey, keysOf, makeKept } from "./kept.ts";

// D13920: the kept answers. Each test is named after the fault it guards; written first, red against the stub.
const T0 = Date.parse("2026-11-11T12:00:00.000Z");
const CHAIN = "gnoland-1";
const REALM = "gno.land/r/gov/dao";
const answer = (markdown = "It lets members vote."): JarvisAnswer => ({ status: "answered", markdown, buttons: [] });
const opened: DatabaseSync[] = [];
afterEach(() => {
  for (const db of opened.splice(0)) if (db.isOpen) db.close();
});
const setup = (options: { maxRows?: number; maxBytes?: number } = {}) => {
  const db = openDatabase(":memory:", [KEPT_TABLES]);
  opened.push(db);
  const clock = { now: T0 };
  const make = () => makeKept(db, { now: () => clock.now, ...options });
  return { db, clock, kept: make(), make };
};
const rows = (db: DatabaseSync): number =>
  (db.prepare("SELECT count(*) AS n FROM jarvis_kept").get() as { n: number }).n;

describe("the key of an explanation", () => {
  it("holds the chain, the realm and the function, and nothing of a room, an asker or a language", () => {
    const key = explainKey(CHAIN, REALM, "Vote");
    expect(key).toBeDefined();
    expect(explainKey(CHAIN, REALM, "Vote")).toBe(key);
    expect(explainKey("onyx-1", REALM, "Vote")).not.toBe(key);
    expect(explainKey(CHAIN, "gno.land/r/gov/other", "Vote")).not.toBe(key);
    expect(explainKey(CHAIN, REALM, "Propose")).not.toBe(key);
    expect(explainKey.length).toBe(3);
  });

  it("keeps a function's case: Vote is not vote", () => {
    expect(explainKey(CHAIN, REALM, "Vote")).not.toBe(explainKey(CHAIN, REALM, "vote"));
  });

  it.each([
    ["a realm that is not a gno.land realm path", [CHAIN, "gno.land/p/demo/avl", "Vote"]],
    ["a realm path with a quote that could close the key", [CHAIN, 'gno.land/r/x","y', "Vote"]],
    ["a realm path of 129 characters", [CHAIN, `gno.land/r/${"a".repeat(118)}`, "Vote"]],
    ["a function that is no name", [CHAIN, REALM, 'Vote","x']],
    ["a function that starts with a digit", [CHAIN, REALM, "1Vote"]],
    ["an empty function", [CHAIN, REALM, ""]],
    ["a function of 65 characters", [CHAIN, REALM, "a".repeat(65)]],
    ["a chain with a space", ["gnoland 1", REALM, "Vote"]],
    ["an empty chain", ["", REALM, "Vote"]],
    ["a chain of 65 characters", ["a".repeat(65), REALM, "Vote"]],
  ] as const)("makes no key for %s, so nothing is kept for it", (_name, [chain, realm, name]) => {
    expect(explainKey(chain, realm, name)).toBeUndefined();
  });

  it("makes a key for a function of 64 characters and for an underscore name", () => {
    expect(explainKey(CHAIN, REALM, "_a".repeat(32))).toBeDefined();
    expect(explainKey(CHAIN, REALM, "Vote_2")).toBeDefined();
  });
});

describe("the prompt's version in an explanation's key", () => {
  it("never serves a row kept under another version of the prompt", () => {
    const { db, kept } = setup();
    const old = JSON.stringify(["explain", EXPLAIN_VERSION - 1, CHAIN, REALM, "Vote"]);
    kept.set(old, answer("the old prompt's"));
    expect(rows(db)).toBe(1);
    expect(kept.get(explainKey(CHAIN, REALM, "Vote") ?? "")).toBeUndefined();
  });

  it("is in the key, so a bumped version is another key", () => {
    expect(explainKey(CHAIN, REALM, "Vote")).toContain(`"explain",${String(EXPLAIN_VERSION)},`);
  });
});

describe("the key of a room's `here`", () => {
  it("is the room's own: another room, another key, so a room's text never reaches another", () => {
    expect(hereKey("#a")).toBe(hereKey("#a"));
    expect(hereKey("#a")).not.toBe(hereKey("#b"));
    expect(hereKey("#a")).not.toBe(explainKey(CHAIN, REALM, "Vote"));
  });
});

describe("the kept answers", () => {
  it("keep an explanation 7 days: served 1 ms before the day, gone at it", () => {
    const { clock, kept } = setup();
    const key = explainKey(CHAIN, REALM, "Vote") ?? "";
    kept.set(key, answer());
    clock.now = T0 + EXPLAIN_MS - 1;
    expect(kept.get(key)).toEqual(answer());
    clock.now = T0 + EXPLAIN_MS;
    expect(kept.get(key)).toBeUndefined();
  });

  it("keep a `here` 1 hour, not 7 days: served 1 ms before the hour, gone at it", () => {
    const { clock, kept } = setup();
    kept.set(hereKey("#a"), answer("Read the board."));
    clock.now = T0 + HERE_MS - 1;
    expect(kept.get(hereKey("#a"))).toEqual(answer("Read the board."));
    clock.now = T0 + HERE_MS;
    expect(kept.get(hereKey("#a"))).toBeUndefined();
  });

  it("count the time from the answer's own time, so a key written again lives from the new write", () => {
    const { clock, kept } = setup();
    const key = hereKey("#a");
    kept.set(key, answer("one"));
    clock.now = T0 + HERE_MS - 1;
    kept.set(key, answer("two"));
    clock.now = T0 + HERE_MS + 1;
    expect(kept.get(key)).toEqual(answer("two"));
  });

  it("are served after a restart: a new store over the same database finds them", () => {
    const { make, kept } = setup();
    kept.set(explainKey(CHAIN, REALM, "Vote") ?? "", answer());
    expect(make().get(explainKey(CHAIN, REALM, "Vote") ?? "")).toEqual(answer());
  });

  it.each([
    ["declined", { status: "declined" }],
    ["busy", { status: "busy" }],
    ["early", { status: "early" }],
    ["capped", { status: "capped" }],
  ] as const)("never keep a `%s` answer, which is no explanation", (_name, refused) => {
    const { db, kept } = setup();
    kept.set(hereKey("#a"), refused);
    expect(kept.get(hereKey("#a"))).toBeUndefined();
    expect(rows(db)).toBe(0);
  });

  it("keep one row for a key written twice", () => {
    const { db, kept } = setup();
    kept.set(hereKey("#a"), answer("one"));
    kept.set(hereKey("#a"), answer("two"));
    expect(rows(db)).toBe(1);
  });
});

describe("the table's bounds (the retention tick)", () => {
  it("expire takes the rows past their time, at most `limit` a call, and tells the count", () => {
    const { db, clock, kept } = setup();
    for (const room of ["#a", "#b", "#c", "#d", "#e"]) kept.set(hereKey(room), answer());
    clock.now = T0 + HERE_MS + 1;
    expect(kept.expire(2)).toBe(2);
    expect(rows(db)).toBe(3);
    expect(kept.expire(10)).toBe(3);
    expect(rows(db)).toBe(0);
  });

  it("expire leaves a row not yet past its time", () => {
    const { db, kept } = setup();
    kept.set(hereKey("#a"), answer());
    expect(kept.expire(10)).toBe(0);
    expect(rows(db)).toBe(1);
  });

  it("expire takes the oldest rows past the row cap, and the newest stay", () => {
    const { db, clock, kept } = setup({ maxRows: 3 });
    for (const room of ["#a", "#b", "#c", "#d", "#e"]) {
      kept.set(hereKey(room), answer());
      clock.now += 1;
    }
    expect(kept.expire(10)).toBe(2);
    expect(rows(db)).toBe(3);
    expect([hereKey("#a"), hereKey("#b")].map((key) => kept.get(key))).toEqual([undefined, undefined]);
    expect(kept.get(hereKey("#e"))).toEqual(answer());
  });

  it("expire takes the oldest rows past the byte cap, and the newest stay", () => {
    const { db, clock, kept } = setup({ maxBytes: 2500 });
    for (const room of ["#a", "#b", "#c", "#d"]) {
      kept.set(hereKey(room), answer("x".repeat(1000)));
      clock.now += 1;
    }
    kept.expire(10);
    expect(rows(db)).toBe(2);
    expect(kept.get(hereKey("#d"))).toEqual(answer("x".repeat(1000)));
    expect(kept.get(hereKey("#a"))).toBeUndefined();
  });

  it("is on the retention's tick: a tick calls expire, so the table never grows past its bounds unseen", () => {
    const db = openDatabase(":memory:", migrations);
    opened.push(db);
    const expire = vi.fn((limit: number) => limit * 0);
    makeRetention(db, {
      log: logger("a-pepper-of-forty-characters-0123456789", () => undefined),
      kept: { expire },
    }).tick();
    expect(expire).toHaveBeenCalledTimes(1);
    expect(expire.mock.calls[0]?.[0]).toBeGreaterThan(0);
  });
});

describe("the migration", () => {
  it("is appended last, after the migrations already there, and makes the table", () => {
    expect(KEPT_TABLES).toContain("CREATE TABLE jarvis_kept");
    expect(migrations.lastIndexOf(KEPT_TABLES)).toBeGreaterThanOrEqual(23);
  });

  it("is STRICT, with its time indexed, as the day's tables are", () => {
    expect(KEPT_TABLES).toContain("STRICT");
    expect(KEPT_TABLES).toMatch(/CREATE INDEX jarvis_kept_by_[a-z]+ ON jarvis_kept/);
  });
});

describe("a room's `here` and the drop of a room", () => {
  it("is removed with the room's other kept rows and no other room's, and survives a restart as removed", () => {
    const { db, make, kept } = setup();
    kept.set(hereKey("#a"), answer(), { room: "#a", started: T0 });
    kept.set(hereKey("#b"), answer(), { room: "#b", started: T0 });
    kept.drop("#a");
    expect(make().get(hereKey("#a"))).toBeUndefined();
    expect(make().get(hereKey("#b"))).toEqual(answer());
    expect(rows(db)).toBe(1);
  });

  it("is not written when its call began at or before the room's last drop, and is after it", () => {
    const { clock, kept } = setup();
    clock.now = T0 + 10;
    kept.drop("#a");
    kept.set(hereKey("#a"), answer("early"), { room: "#a", started: T0 + 10 });
    expect(kept.get(hereKey("#a"))).toBeUndefined();
    kept.set(hereKey("#a"), answer("late"), { room: "#a", started: T0 + 11 });
    expect(kept.get(hereKey("#a"))).toEqual(answer("late"));
  });

  it("leaves an explanation, which is no room's, when a room is dropped", () => {
    const { kept } = setup();
    kept.set(explainKey(CHAIN, REALM, "Vote") ?? "", answer());
    kept.drop("#a");
    expect(kept.get(explainKey(CHAIN, REALM, "Vote") ?? "")).toEqual(answer());
  });
});

describe("a row that is no answer", () => {
  it.each([
    ["text that is no JSON", "{nope"],
    ["another status", JSON.stringify({ status: "declined" })],
    [
      "a markdown past 8,000 code points",
      JSON.stringify({ status: "answered", markdown: "x".repeat(8001), buttons: [] }),
    ],
    [
      "an answer with a field it does not hold",
      JSON.stringify({ status: "answered", markdown: "x", buttons: [], cost: 1 }),
    ],
  ])("is read as none, never a throw: %s", (_name, text) => {
    const { db, kept } = setup();
    db.prepare("INSERT INTO jarvis_kept (key, answer, at, until, room, bytes) VALUES (?, ?, ?, ?, NULL, 1)").run(
      hereKey("#a"),
      text,
      T0,
      T0 + HERE_MS,
    );
    expect(kept.get(hereKey("#a"))).toBeUndefined();
  });
});

describe("the key an ask is kept under", () => {
  it("is the explanation's for a function on a known chain, the room's for a `here`, none for the rest", () => {
    expect(keptKey({ ask: "function", room: "#a", realm: REALM, function: "Vote" }, CHAIN)).toBe(
      explainKey(CHAIN, REALM, "Vote"),
    );
    expect(keptKey({ ask: "function", room: "#a", realm: REALM, function: "Vote" }, undefined)).toBeUndefined();
    expect(keptKey({ ask: "here", room: "#a" }, CHAIN)).toBe(hereKey("#a"));
    expect(keptKey({ ask: "catch-up", room: "#a" }, CHAIN)).toBeUndefined();
    expect(keptKey({ question: "What is new?", room: "#a" }, CHAIN)).toBeUndefined();
  });

  it("is never one a row is written for when it is of neither kind", () => {
    const { db, kept } = setup();
    kept.set(JSON.stringify(["other", "x"]), answer());
    kept.set("not json", answer());
    expect(rows(db)).toBe(0);
  });
});

describe("the table's bounds, pinned", () => {
  it("are 5,000 rows and 16 MiB by default", () => {
    expect(KEPT_MAX).toEqual({ rows: 5000, bytes: 16 * 1024 * 1024 });
  });

  it("count a row's bytes in UTF-8, not in characters: three-byte characters hit a byte cap that ASCII does not", () => {
    const { db, clock, kept } = setup({ maxBytes: 5000 });
    for (const room of ["#a", "#b"]) {
      kept.set(hereKey(room), answer("\u20ac".repeat(1000)));
      clock.now += 1;
    }
    kept.expire(10);
    expect(rows(db)).toBe(1);
  });

  it("expire takes no more than its limit across the past rows and the caps together", () => {
    const { db, clock, kept } = setup({ maxRows: 1 });
    for (const room of ["#a", "#b", "#c", "#d"]) {
      kept.set(hereKey(room), answer());
      clock.now += 1;
    }
    expect(kept.expire(2)).toBe(2);
    expect(rows(db)).toBe(2);
  });

  it("serves a row until its time and not at it, and expire takes it at that same instant", () => {
    const { db, clock, kept } = setup();
    kept.set(hereKey("#a"), answer());
    clock.now = T0 + HERE_MS;
    expect(kept.get(hereKey("#a"))).toBeUndefined();
    expect(kept.expire(10)).toBe(1);
    expect(rows(db)).toBe(0);
  });
});

describe("the retention's tick with the kept answers", () => {
  const retention = (kept: { expire: (limit: number) => number }, log: (line: string) => void = () => undefined) => {
    const db = openDatabase(":memory:", migrations);
    opened.push(db);
    return makeRetention(db, { log: logger("a-pepper-of-forty-characters-0123456789", log), kept });
  };

  it("goes on when kept.expire throws: the tick ends and the fault is logged by its step", () => {
    const lines: string[] = [];
    const tick = retention(
      {
        expire: () => {
          throw new Error("disk");
        },
      },
      (line) => lines.push(line),
    );
    expect(() => tick.tick()).not.toThrow();
    expect(lines.join("")).toContain("kept_expire");
  });

  it("asks for what the budget leaves and reports a backlog when it took all it asked", () => {
    const expire = vi.fn((limit: number) => limit);
    expect(retention({ expire }).tick()).toBe(true);
    expect(expire.mock.calls[0]?.[0]).toBeGreaterThan(0);
  });
});

// The ask route with the kept answers: what is kept in the database, for whom, and what it costs the asker.
const ORIGIN = "https://gnoworld.test";
const ANNA = Address.parse("g1jg8mtutu9khhfwc4nxmuhcpftf0pajdhfvsqf5");
const BEN = Address.parse("g10gh7yq7swv77efwfcqy2znp37cmeughxx3y5tv");
const TOKENS = new Map([
  ["anna-token-of-forty-three-characters-000000", ANNA],
  ["ben-token-of-forty-three-characters-0000000", BEN],
]);
const [ANNA_TOKEN, BEN_TOKEN] = [...TOKENS.keys()];
// What jarvis gives for a function: `keep` says its code reads all succeeded and found it.
const PAID = (cost = 4000, keep = true): JarvisPaidAnswer => ({
  status: "answered",
  markdown: "It lets members vote.",
  buttons: [],
  cost,
  ...(keep ? { keep, version: EXPLAIN_VERSION } : {}),
});
const EXPLAIN = { ask: "function", room: "#a", realm: "gno.land/r/gov/dao", function: "Vote" } as const;
const HERE = { ask: "here", room: "#a" } as const;

interface Options {
  // The ask's quota of a day, for an account of no name on chain.
  quota?: number;
  // The default universe's chain: the one a room with no chain of its own is read on.
  defaultChain?: string | null;
  on?: boolean;
  heard?: boolean;
  // The chain of a room's world; none for a room with no world.
  chain?: (room: string) => string | undefined;
  answer?: () => Promise<{ ok: true; answer: JarvisPaidAnswer } | { ok: false; error: "failed" }>;
}
const routing = ({
  chain = () => "gnoland-1",
  defaultChain = "gnoland-1",
  quota = 20,
  answer,
  on = true,
  heard = true,
}: Options = {}) => {
  const db = openDatabase(":memory:", [QUOTA_TABLES, DAY_TABLES, KEPT_TABLES]);
  opened.push(db);
  const clock = { now: T0 };
  const now = () => clock.now;
  const sent: JarvisAsk[] = [];
  const lines: string[] = [];
  const parts = {
    session: (token: string | undefined) => TOKENS.get(token ?? ""),
    origins: [ORIGIN],
    mayRead: () => true,
    recent: () => [{ speaker: 1, text: "the poll closes today" }],
    named: () => Promise.resolve(true),
    quota: makeQuota(db, { first: { quota, quotaUnnamed: quota, unlimited: [] }, now }),
    day: makeDay(db, { now }),
    served: makeServed({ now }),
    kept: makeKept(db, { now }),
    chainOf: chain,
    defaultChain: () => defaultChain ?? undefined,
    heard: () => heard,
    signedAt: () => T0 - 60 * 60_000,
    last: () => "m1",
    hosts: ["gno.land", "gnoworld.test"],
    jarvis: {
      ask: (request: JarvisAsk) => {
        sent.push(request);
        return answer === undefined ? Promise.resolve({ ok: true as const, answer: PAID() }) : answer();
      },
    },
    on,
    questionChars: 2000,
    perMinute: 1000,
    log: logger("a-pepper-of-forty-characters-0123456789", (line) => lines.push(line)),
    now,
  };
  const app = makeApp(parts.log, () => true);
  app.route("/api/jarvis", askRoutes(parts));
  const ask = async (body: unknown, token = ANNA_TOKEN) => {
    const response = await app.request(
      "/api/jarvis/ask",
      {
        method: "POST",
        headers: { origin: ORIGIN, "content-type": "application/json", cookie: `__Host-session=${token ?? ""}` },
        body: JSON.stringify(body),
      },
      { incoming: { socket: { remoteAddress: "203.0.113.7" } } },
    );
    return (await response.json()) as JarvisAnswer;
  };
  const spent = (account: string): number =>
    db
      .prepare("SELECT coalesce(sum(micros), 0) AS n FROM jarvis_spent WHERE account = ?")
      .all(account)
      .reduce((a, r) => a + Number(r["n"]), 0);
  const asked = (account: string): number =>
    db
      .prepare("SELECT coalesce(sum(count), 0) AS n FROM jarvis_asked WHERE account = ?")
      .all(account)
      .reduce((a, r) => a + Number(r["n"]), 0);
  const kept = (): number => (db.prepare("SELECT count(*) AS n FROM jarvis_kept").get() as { n: number }).n;
  return { app, ask, clock, sent, spent, asked, kept, parts, db };
};

describe("a function's explanation kept for 7 days", () => {
  it("makes one model call for two rooms asking the same function", async () => {
    const { ask, sent } = routing();
    await ask(EXPLAIN);
    expect(await ask({ ...EXPLAIN, room: "#b" }, BEN_TOKEN)).toMatchObject({ status: "answered" });
    expect(sent).toHaveLength(1);
  });

  it("is served again after the 10 minutes of memory, which is where it was forgotten", async () => {
    const { ask, clock, sent } = routing();
    await ask(EXPLAIN);
    clock.now = T0 + 11 * 60_000;
    await ask({ ...EXPLAIN, room: "#b" }, BEN_TOKEN);
    expect(sent).toHaveLength(1);
  });

  it("is asked of the model again once the 7 days are up, and not before", async () => {
    const { ask, clock, sent } = routing();
    await ask(EXPLAIN);
    clock.now = T0 + EXPLAIN_MS - 1;
    await ask({ ...EXPLAIN, room: "#b" }, BEN_TOKEN);
    expect(sent).toHaveLength(1);
    clock.now = T0 + EXPLAIN_MS + 1;
    await ask({ ...EXPLAIN, room: "#c" }, BEN_TOKEN);
    expect(sent).toHaveLength(2);
  });

  it("is kept apart for another chain, realm or function", async () => {
    const { ask, sent } = routing({ chain: (room) => (room === "#onyx" ? "onyx-1" : "gnoland-1") });
    await ask(EXPLAIN);
    await ask({ ...EXPLAIN, room: "#onyx" });
    await ask({ ...EXPLAIN, function: "Propose" });
    await ask({ ...EXPLAIN, realm: "gno.land/r/gov/other" });
    expect(sent).toHaveLength(4);
  });

  it("is never kept for a room whose chain is unknown: no key is guessed", async () => {
    const { ask, sent, kept } = routing({ chain: () => undefined });
    await ask(EXPLAIN);
    await ask({ ...EXPLAIN, room: "#b" }, BEN_TOKEN);
    expect(kept()).toBe(0);
    expect(sent).toHaveLength(2);
  });

  it("is read, for a room whose chain is unknown, on the default universe's chain, and kept for no room", async () => {
    const { ask, sent, kept } = routing({ chain: () => undefined, defaultChain: "onyx-1" });
    await ask(EXPLAIN);
    expect(sent[0]).toMatchObject({ ask: "function", chain: "onyx-1", lines: [] });
    expect(kept()).toBe(0);
  });

  it("is sent with no chain when the server has no default universe, for jarvis to refuse, and kept for no room", async () => {
    const { ask, sent, kept } = routing({ chain: () => undefined, defaultChain: null });
    await ask(EXPLAIN);
    expect(sent[0]).not.toHaveProperty("chain");
    expect(kept()).toBe(0);
  });

  it("is read on the room's own chain, not the default one, when the room has one", async () => {
    const { ask, sent } = routing({ defaultChain: "onyx-1" });
    await ask(EXPLAIN);
    expect(sent[0]).toMatchObject({ chain: "gnoland-1" });
  });

  it("is never kept under a function name of 65 characters, which no key holds, and is still answered", async () => {
    const { ask, kept, sent } = routing();
    const long = { ...EXPLAIN, function: "a".repeat(65) };
    expect(await ask(long)).toMatchObject({ status: "answered" });
    await ask({ ...long, room: "#b" }, BEN_TOKEN);
    expect(kept()).toBe(0);
    expect(sent).toHaveLength(2);
  });

  it("is kept for a realm path of 128 characters", async () => {
    const { ask, kept } = routing();
    await ask({ ...EXPLAIN, realm: `gno.land/r/${"a".repeat(117)}` });
    expect(kept()).toBe(1);
  });

  it("is never kept when jarvis does not say its code reads found the function, and is still answered and charged", async () => {
    const { ask, kept, sent, spent } = routing({
      answer: () => Promise.resolve({ ok: true, answer: PAID(4000, false) }),
    });
    expect(await ask(EXPLAIN)).toMatchObject({ status: "answered" });
    await ask(EXPLAIN, BEN_TOKEN);
    expect(kept()).toBe(0);
    expect(sent).toHaveLength(2);
    expect(spent(ANNA)).toBe(4000);
  });

  it("is never kept when the answer was made under another version of the prompt, and is still answered", async () => {
    const stale = { ...PAID(), version: EXPLAIN_VERSION + 1 };
    const { ask, kept, sent } = routing({ answer: () => Promise.resolve({ ok: true, answer: stale }) });
    expect(await ask(EXPLAIN)).toMatchObject({ status: "answered" });
    await ask({ ...EXPLAIN, room: "#b" }, BEN_TOKEN);
    expect(kept()).toBe(0);
    expect(sent).toHaveLength(2);
  });

  it("is never kept when the answer carries no version", async () => {
    const bare: JarvisPaidAnswer = {
      status: "answered",
      markdown: "It lets members vote.",
      buttons: [],
      cost: 1,
      keep: true,
    };
    const { ask, kept } = routing({ answer: () => Promise.resolve({ ok: true, answer: bare }) });
    await ask(EXPLAIN);
    expect(kept()).toBe(0);
  });

  it("is handed to jarvis with no line of the room and the chain the door found, while a `here` keeps its lines and no chain", async () => {
    const { ask, sent } = routing();
    await ask(EXPLAIN);
    await ask(HERE);
    expect(sent[0]).toMatchObject({ ask: "function", chain: "gnoland-1", lines: [] });
    expect(sent[1]?.lines).toHaveLength(1);
    expect(sent[1]).not.toHaveProperty("chain");
  });

  it("is refused when the page sends a chain of its own: the door finds it", async () => {
    const { app, sent } = routing();
    const response = await app.request(
      "/api/jarvis/ask",
      {
        method: "POST",
        headers: { origin: ORIGIN, "content-type": "application/json", cookie: `__Host-session=${ANNA_TOKEN ?? ""}` },
        body: JSON.stringify({ ...EXPLAIN, chain: "onyx-1" }),
      },
      { incoming: { socket: { remoteAddress: "203.0.113.7" } } },
    );
    expect(response.status).toBe(400);
    expect(sent).toHaveLength(0);
  });

  it("is never kept when the model failed", async () => {
    const { ask, kept, sent } = routing({ answer: () => Promise.resolve({ ok: false, error: "failed" }) });
    await ask(EXPLAIN);
    await ask(EXPLAIN, BEN_TOKEN);
    expect(kept()).toBe(0);
    expect(sent).toHaveLength(2);
  });

  it("is never kept when the model declined", async () => {
    const { ask, kept } = routing({
      answer: () => Promise.resolve({ ok: true, answer: { status: "declined", cost: 100 } }),
    });
    await ask(EXPLAIN);
    expect(kept()).toBe(0);
  });

  it("costs the first asker's share once, and never the later asker's share nor question", async () => {
    const { ask, spent, asked } = routing();
    await ask(EXPLAIN);
    await ask({ ...EXPLAIN, room: "#b" }, BEN_TOKEN);
    await ask({ ...EXPLAIN, room: "#c" }, BEN_TOKEN);
    expect([spent(ANNA), spent(BEN)]).toEqual([4000, 0]);
    expect([asked(ANNA), asked(BEN)]).toEqual([1, 0]);
  });

  it("is kept after a restart: a new memory over the same database serves it", async () => {
    const first = routing();
    await first.ask(EXPLAIN);
    const second = {
      ...first.parts,
      served: makeServed({ now: () => T0 }),
      kept: makeKept(first.db, { now: () => T0 }),
    };
    const app = makeApp(second.log, () => true);
    app.route("/api/jarvis", askRoutes(second));
    const response = await app.request(
      "/api/jarvis/ask",
      {
        method: "POST",
        headers: { origin: ORIGIN, "content-type": "application/json", cookie: `__Host-session=${BEN_TOKEN ?? ""}` },
        body: JSON.stringify({ ...EXPLAIN, room: "#b" }),
      },
      { incoming: { socket: { remoteAddress: "203.0.113.7" } } },
    );
    expect(await response.json()).toMatchObject({ status: "answered" });
    expect(first.sent).toHaveLength(1);
  });
});

describe("`here` kept for 1 hour, a room's own", () => {
  it("is served to another asker in the same room, with no new model call", async () => {
    const { ask, sent } = routing();
    await ask(HERE);
    await ask(HERE, BEN_TOKEN);
    expect(sent).toHaveLength(1);
  });

  it("is never shared across rooms, though the world and the chain are the same", async () => {
    const { ask, sent } = routing();
    await ask(HERE);
    await ask({ ...HERE, room: "#b" }, BEN_TOKEN);
    expect(sent).toHaveLength(2);
  });

  it("is kept in the database past the memory's 10 minutes, and asked again at the hour, not before", async () => {
    const { ask, clock, sent } = routing();
    await ask(HERE);
    clock.now = T0 + HERE_MS - 1;
    await ask(HERE, BEN_TOKEN);
    expect(sent).toHaveLength(1);
    clock.now = T0 + HERE_MS + 1;
    await ask(HERE, BEN_TOKEN);
    expect(sent).toHaveLength(2);
  });
});

describe("what is never kept in the database", () => {
  it("is a person's own question and a catch-up", async () => {
    const { ask, kept } = routing();
    await ask({ question: "What did they decide about the poll?", room: "#a" });
    await ask({ ask: "catch-up", room: "#a" });
    expect(kept()).toBe(0);
  });
});

describe("a kept answer", () => {
  it("never serves a caller the route refuses: no session, a share spent, jarvis switched off", async () => {
    const first = routing();
    await first.ask(EXPLAIN);
    const { ask, parts } = routing({ on: false });
    expect(await ask(EXPLAIN)).toEqual({ status: "off" });
    expect(parts.kept).toBeDefined();
    const again = first;
    expect(await again.ask(EXPLAIN, "not-a-token")).toMatchObject({ error: "unauthenticated" });
    again.parts.day.spend(BEN, 250_000, T0);
    expect(await again.ask(EXPLAIN, BEN_TOKEN)).toEqual({ status: "capped" });
    expect(again.sent).toHaveLength(1);
  });

  it("never serves an account that was not heard in the chat", async () => {
    const first = routing();
    await first.ask(EXPLAIN);
    const early = { ...first.parts, heard: () => false };
    const app = makeApp(early.log, () => true);
    app.route("/api/jarvis", askRoutes(early));
    const response = await app.request(
      "/api/jarvis/ask",
      {
        method: "POST",
        headers: { origin: ORIGIN, "content-type": "application/json", cookie: `__Host-session=${BEN_TOKEN ?? ""}` },
        body: JSON.stringify(EXPLAIN),
      },
      { incoming: { socket: { remoteAddress: "203.0.113.7" } } },
    );
    expect(await response.json()).toEqual({ status: "early" });
  });
});

// A call jarvis answers when the test says.
const held = () => {
  let release: (answer: JarvisPaidAnswer) => void = () => undefined;
  const wait = new Promise<JarvisPaidAnswer>((resolve) => {
    release = resolve;
  });
  return { release, answer: async () => ({ ok: true as const, answer: await wait }) };
};
const turn = () => new Promise<void>((resolve) => setImmediate(resolve));

describe("a function asked in two rooms at once", () => {
  it("makes one call, answers both, and charges the first asker alone", async () => {
    const gate = held();
    const { ask, sent, spent, clock } = routing({ answer: gate.answer });
    const both = Promise.all([ask(EXPLAIN), ask({ ...EXPLAIN, room: "#b" }, BEN_TOKEN)]);
    await turn();
    await turn();
    gate.release(PAID());
    expect((await both).map(({ status }) => status)).toEqual(["answered", "answered"]);
    expect(sent).toHaveLength(1);
    expect([spent(ANNA), spent(BEN)]).toEqual([4000, 0]);
    expect(clock.now).toBe(T0);
  });

  it("answers the second asker when the first asker's quota is full, and never leaves it waiting", async () => {
    const { ask, sent } = routing({ quota: 1 });
    await ask({ question: "What is the poll?", room: "#a" });
    const [first, second] = await Promise.all([ask(EXPLAIN), ask({ ...EXPLAIN, room: "#b" }, BEN_TOKEN)]);
    expect(first).toEqual({ error: "full" });
    expect(second).toMatchObject({ status: "answered" });
    expect(sent.filter((request) => "ask" in request && request.ask === "function")).toHaveLength(1);
  });

  it("makes two calls for two chains", async () => {
    const gate = held();
    const { ask, sent } = routing({ answer: gate.answer, chain: (room) => (room === "#b" ? "onyx-1" : "gnoland-1") });
    const both = Promise.all([ask(EXPLAIN), ask({ ...EXPLAIN, room: "#b" }, BEN_TOKEN)]);
    await turn();
    await turn();
    gate.release(PAID());
    await both;
    expect(sent).toHaveLength(2);
  });

  it("serves the waiter the failure of a call that failed, and asks again for a third", async () => {
    let fails = true;
    const { ask, sent } = routing({
      answer: () => Promise.resolve(fails ? { ok: false, error: "failed" } : { ok: true, answer: PAID() }),
    });
    await ask(EXPLAIN);
    fails = false;
    expect(await ask({ ...EXPLAIN, room: "#b" }, BEN_TOKEN)).toMatchObject({ status: "answered" });
    expect(sent).toHaveLength(2);
  });
});

describe("a room's `here` when a line of the room is taken", () => {
  it("is dropped from the table, and no other room's, and is asked again", async () => {
    const { ask, kept, sent, parts } = routing();
    await ask(HERE);
    await ask({ ...HERE, room: "#b" });
    parts.served.drop("#a");
    parts.kept.drop("#a");
    expect(kept()).toBe(1);
    await ask(HERE);
    expect(sent).toHaveLength(3);
  });

  it("is not written when its call began before the drop, while an explanation in flight is kept", async () => {
    const gate = held();
    const { ask, kept, parts } = routing({ answer: gate.answer });
    const [here, explain] = [ask(HERE), ask(EXPLAIN, BEN_TOKEN)];
    await turn();
    await turn();
    parts.kept.drop("#a");
    gate.release(PAID());
    await Promise.all([here, explain]);
    expect(kept()).toBe(1);
  });
});

// The surviving mutants of the day (slice 13): each test is named after the fault it guards.
describe("the keys, held at their ends", () => {
  it("makes no explanation key for a realm that only contains a gno.land path", () => {
    expect(explainKey(CHAIN, `x ${REALM}`, "Vote")).toBeUndefined();
  });

  it("is in flight under the room's key for a `here`, and under a served key for a function of an unknown chain", () => {
    const ask = { ask: "here", room: "#a" } as const;
    const at = { last: undefined, account: "g1someone", chain: undefined };
    expect(keysOf(ask, at)).toEqual({ key: servedKey(ask, undefined, "g1someone"), keptKey: hereKey("#a") });
    expect(keysOf(ask, { ...at, chain: CHAIN }).key).toBe(hereKey("#a"));
    const explain = { ask: "function", room: "#a", realm: REALM, function: "Vote" } as const;
    expect(keysOf(explain, at)).toEqual({ key: servedKey(explain, undefined, "g1someone"), keptKey: undefined });
    expect(keysOf(explain, { ...at, chain: CHAIN }).key).toBe(explainKey(CHAIN, REALM, "Vote"));
  });

  it("keeps nothing under a key that only contains a kind's start", () => {
    const { db, kept } = setup();
    kept.set(`x${hereKey("#a")}`, answer());
    expect(rows(db)).toBe(0);
  });
});

describe("a row that is no answer", () => {
  it("is not served when its text is no JSON, and does not throw", () => {
    const { db, kept } = setup();
    db.prepare("INSERT INTO jarvis_kept (key, answer, at, until, room, bytes) VALUES (?, ?, ?, ?, ?, ?)").run(
      hereKey("#a"),
      "{not json",
      T0,
      T0 + HERE_MS,
      null,
      9,
    );
    expect(kept.get(hereKey("#a"))).toBeUndefined();
  });
});

describe("the byte cap, at its edge", () => {
  it("takes no row more than needed when the rows over the cap weigh exactly the oldest row", () => {
    const each = Buffer.byteLength(JSON.stringify(answer("x".repeat(1000))));
    const small = setup({ maxBytes: 2 * each });
    for (const room of ["#a", "#b", "#c"]) {
      small.kept.set(hereKey(room), answer("x".repeat(1000)));
      small.clock.now += 1;
    }
    expect(small.kept.expire(10)).toBe(1);
    expect(rows(small.db)).toBe(2);
  });
});

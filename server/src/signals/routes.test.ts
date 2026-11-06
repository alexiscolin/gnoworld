import type { DatabaseSync } from "node:sqlite";
import { Address, ChartAnswer, type Signal } from "@gnoworld/schemas";
import { afterEach, describe, expect, it } from "vitest";
import { makeApp } from "../app.ts";
import { openDatabase } from "@gnoworld/service/db";
import { logger } from "@gnoworld/service/log";
import type { Roles } from "../roles/roles.ts";
import { makeSignals, SIGNAL_TABLES } from "./signals.ts";
import { signalRoutes } from "./routes.ts";

// Slice 9h: POST /api/signals/chart (a logged-in account opens a world) (who is first is told on the stream alone).
// Authorization is checked before any work; a guest never charts; an account has a rate (D211: 20 a hour, every
// call counted, a refused one included); the winner's signal is published once, never the answer's word alone.
const T0 = Date.parse("2026-11-05T12:00:00.000Z");
const HOUR = 60 * 60_000;
const ORIGIN = "https://gnoworld.test";
const PEER = "203.0.113.7";
const RULES = { bannedWords: [], linksPerMessage: 3, mentionsPerMessage: 5, linksForNewAccount: 2 };
const ALICE = Address.parse("g10gh7yq7swv77efwfcqy2znp37cmeughxx3y5tv");
const BOB = Address.parse("g1jg8mtutu9khhfwc4nxmuhcpftf0pajdhfvsqf5");
const ROLES: Roles = {
  team: new Set<Address>(),
  trusted: new Set<Address>(),
  worlds: new Map(
    ["earth", "bubble", "govdao"].map((slug) => [slug, { moderators: new Set<Address>(), rules: RULES }] as const),
  ),
};
const TOKENS = new Map<string, Address>([
  ["alice", ALICE],
  ["bob", BOB],
]);

const opened: DatabaseSync[] = [];
afterEach(() => {
  for (const db of opened.splice(0)) db.close();
});

const setup = (chartable?: ReadonlySet<string>) => {
  const db = openDatabase(":memory:", [SIGNAL_TABLES]);
  opened.push(db);
  const clock = { now: T0 };
  const signals = makeSignals(db, { now: () => clock.now });
  const published: Signal[] = [];
  const app = makeApp(
    logger("a-pepper-of-forty-characters-0123456789", () => true),
    () => true,
  );
  app.route(
    "/api/signals",
    signalRoutes({
      signals,
      roles: ROLES,
      session: (token) => TOKENS.get(token ?? ""),
      origins: [ORIGIN],
      log: () => undefined,
      now: () => clock.now,
      publish: (signal) => published.push(signal),
      chartable,
    }),
  );
  interface Ask {
    who?: string;
    origin?: string | null;
    type?: string | null;
  }
  const post = (body: unknown, { who, origin = ORIGIN, type = "application/json" }: Ask = {}) =>
    app.request(
      "/api/signals/chart",
      {
        method: "POST",
        headers: {
          ...(origin === null ? {} : { origin }),
          ...(type === null ? {} : { "content-type": type }),
          ...(who === undefined ? {} : { cookie: `__Host-session=${who}` }),
        },
        body: typeof body === "string" ? body : JSON.stringify(body),
      },
      { incoming: { socket: { remoteAddress: PEER } } },
    );
  return { clock, db, published, signals, post };
};

describe("charting a world", () => {
  it("lets the first logged-in account chart it: the answer says so and its signal is published once", async () => {
    const { post, published } = setup();
    const response = await post({ world: "govdao" }, { who: "alice" });
    expect(response.status).toBe(200);
    expect(response.headers.get("cache-control")).toBe("no-store");
    expect(ChartAnswer.parse(await response.json())).toEqual({ world: "govdao", first: true });
    expect(published).toEqual([{ kind: "chart", world: "govdao", account: ALICE, at: "2026-11-05T12:00:00.000Z" }]);
  });

  // D218: FIRST_TO_CHART_WORLDS names the worlds that can be charted; any other listed world answers "not first" and records
  // nothing, as quietly as a later account's call.
  it("charts only the worlds the setting names, and answers not first for another listed world, recording nothing", async () => {
    const { post, published, signals } = setup(new Set(["govdao"]));
    expect(await (await post({ world: "bubble" }, { who: "alice" })).json()).toEqual({ world: "bubble", first: false });
    expect(signals.firsts("bubble").charted).toBeNull();
    expect(published).toEqual([]);
    expect(await (await post({ world: "govdao" }, { who: "bob" })).json()).toEqual({ world: "govdao", first: true });
    expect(published.map(({ world }) => world)).toEqual(["govdao"]);
  });

  it("tells every later account, the first one included, that it is not first, and publishes nothing more", async () => {
    const { post, published } = setup();
    await post({ world: "govdao" }, { who: "alice" });
    for (const who of ["bob", "alice"]) {
      const response = await post({ world: "govdao" }, { who });
      expect(await response.json()).toEqual({ world: "govdao", first: false });
    }
    expect(published).toHaveLength(1);
  });

  it("is won by one of two accounts asking at once", async () => {
    const { post, published, signals } = setup();
    const [a, b] = await Promise.all([
      post({ world: "bubble" }, { who: "alice" }),
      post({ world: "bubble" }, { who: "bob" }),
    ]);
    const answers = [ChartAnswer.parse(await a.json()), ChartAnswer.parse(await b.json())];
    expect(answers.filter(({ first }) => first)).toHaveLength(1);
    expect(published).toHaveLength(1);
    expect(signals.firsts("bubble").charted?.account).toBe(published[0]?.account);
  });

  it("never charts for a guest: 401, nothing recorded, nothing published", async () => {
    const { post, published, signals } = setup();
    for (const who of [undefined, "unknown-token"]) {
      const response = await post({ world: "govdao" }, who === undefined ? {} : { who });
      expect([response.status, await response.json()]).toEqual([401, { error: "unauthenticated" }]);
    }
    expect(published).toEqual([]);
    expect(signals.firsts("govdao").charted).toBeNull();
  });

  // Authorization comes before any work (server.md): a guest is told 401 whatever it sends, never a 400 or a 404 that
  // would tell it which worlds the server lists; the origin guard alone stands before the session.
  it("tells a guest 401 for a body that is no JSON and for a world the server does not list, a 403 for another origin", async () => {
    const { post, published, signals } = setup();
    for (const body of ["not json", { world: "fresh-mint" }, { world: "../x" }, { world: "govdao", account: BOB }]) {
      const response = await post(body, {});
      expect([response.status, await response.json()]).toEqual([401, { error: "unauthenticated" }]);
    }
    expect((await post({ world: "govdao" }, { origin: "https://evil.test" })).status).toBe(403);
    expect(published).toEqual([]);
    expect(signals.firsts("govdao").charted).toBeNull();
  });

  it("refuses an unlisted origin, a body that is no JSON, a bad world and an unknown one, charting nothing", async () => {
    const { post, published, signals } = setup();
    const asks: [unknown, { who: string; origin?: string | null; type?: string | null }, number][] = [
      [{ world: "govdao" }, { who: "alice", origin: "https://evil.test" }, 403],
      [{ world: "govdao" }, { who: "alice", origin: null }, 403],
      [{ world: "govdao" }, { who: "alice", type: "text/plain" }, 415],
      ["not json", { who: "alice" }, 400],
      [{ world: "govdao", account: BOB }, { who: "alice" }, 400],
      [{ world: "../etc" }, { who: "alice" }, 400],
      [{ world: "fresh-mint" }, { who: "alice" }, 404],
    ];
    for (const [body, who, status] of asks) expect((await post(body, who)).status).toBe(status);
    expect(published).toEqual([]);
    expect(signals.firsts("govdao").charted).toBeNull();
  });

  // D211: every call of a logged-in account counts, whatever its answer; D216: the order is the origin, the session, the
  // account's count, then the body and the world, so a refused world or a bad body is spent too and probes nothing for free.
  it("gives an account 20 calls an hour, refused ones counted too: the 21st is a 429 that charts nothing", async () => {
    const { post, signals, published } = setup();
    for (let n = 0; n < 10; n += 1) expect((await post({ world: "earth" }, { who: "alice" })).status).toBe(200);
    for (let n = 0; n < 5; n += 1) expect((await post({ world: "fresh-mint" }, { who: "alice" })).status).toBe(404);
    for (let n = 0; n < 5; n += 1) expect((await post("not json", { who: "alice" })).status).toBe(400);
    const over = await post({ world: "bubble" }, { who: "alice" });
    expect([over.status, await over.json()]).toEqual([429, { error: "too_many" }]);
    expect(signals.firsts("bubble").charted).toBeNull();
    expect(published).toHaveLength(1);
    // Another account has its own count.
    expect((await post({ world: "bubble" }, { who: "bob" })).status).toBe(200);
  });

  it("opens the account's window again exactly an hour after it started, not before", async () => {
    const { post, clock, signals } = setup();
    for (let n = 0; n < 20; n += 1) await post({ world: "earth" }, { who: "alice" });
    clock.now = T0 + HOUR - 1;
    expect((await post({ world: "bubble" }, { who: "alice" })).status).toBe(429);
    clock.now = T0 + HOUR;
    expect((await post({ world: "bubble" }, { who: "alice" })).status).toBe(200);
    expect(signals.firsts("bubble").charted?.account).toBe(ALICE);
  });

  it("does not spend a guest's call on an account's window", async () => {
    const { post } = setup();
    for (let n = 0; n < 50; n += 1) await post({ world: "earth" });
    expect((await post({ world: "earth" }, { who: "alice" })).status).toBe(200);
  });
});

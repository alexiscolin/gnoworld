import { PersonCardData, type Worlds } from "@gnoworld/schemas/indexer";
import { openDatabase } from "@gnoworld/service/db";
import { describe, expect, it } from "vitest";
import { makeApp } from "../app.ts";
import { balanceOf, balanceReader, type Balance } from "./balance.ts";
import type { Row } from "./history.ts";
import { callsOf, peopleRoutes, systemOf } from "./person.ts";
import { PEOPLE_TABLES } from "./personTables.ts";
import { TOKEN_TABLES } from "./tokenStore.ts";
import { ROLLUP_TABLES, rollupStore } from "./rollupStore.ts";

const A = "g1e3vld469ekks28mhtd4aqua3mdaz64qgdtz29k";
const B = "g1etf3rd7dqghksj8r5yunkgmvpupdfszdjhuzju";
const NOW = Date.parse("2026-11-12T10:00:00Z");

const realm = (path: string, deployer: string) => ({
  path,
  deployer,
  deployerName: null,
  functions: [],
  imports: [],
  calls: null,
  callers: null,
  lastHeight: null,
});
const worlds = (...each: { id: string; realms: ReturnType<typeof realm>[] }[]): Worlds => ({
  version: 1,
  universe: "onyx",
  updated: "2026-11-12T09:00:00.000Z",
  worlds: each.map((world) => ({ ...world, namespace: world.id })),
});

// One call a height from `caller`, each on the day the test names.
function filled(calls: { height: number; day: string; caller: string; path?: string; func?: string }[]) {
  const db = openDatabase(":memory:", [ROLLUP_TABLES, PEOPLE_TABLES, TOKEN_TABLES]);
  const store = rollupStore(db, "onyx");
  const row = ({ height, caller, path = "gno.land/r/crowd/app", func = "Do" }: (typeof calls)[number]): Row => ({
    height,
    success: true,
    calls: [{ path, caller, func }],
    skipped: 0,
  });
  store.add(
    calls.map(row),
    { days: new Map(calls.map((call) => [call.height, call.day])), times: new Map() },
    Math.max(...calls.map((call) => call.height)),
  );
  return db;
}

describe("a person's calls", () => {
  it("counts their calls, realms and days, and none for a person who never called", () => {
    const db = filled([
      { height: 1, day: "2026-11-10", caller: A },
      { height: 2, day: "2026-11-10", caller: A, path: "gno.land/r/other/x" },
      { height: 3, day: "2026-11-11", caller: B },
    ]);
    expect(callsOf(db, A)).toMatchObject({
      calls: { total: 2, realms: 2, days: [{ day: "2026-11-10", calls: 2 }] },
    });
    expect(callsOf(db, A).latest.map(({ realm: path }) => path)).toEqual([
      "gno.land/r/other/x",
      "gno.land/r/crowd/app",
    ]);
    expect(callsOf(db, "g1nobodynobodynobodynobodynobodynobodyno")).toEqual({ calls: null, latest: [] });
  });

  it("keeps the newest 30 days and the newest 8 calls", () => {
    const days = Array.from({ length: 31 }, (_, at) =>
      new Date(Date.parse("2026-10-01") + at * 86_400_000).toISOString().slice(0, 10),
    );
    const db = filled(days.map((day, at) => ({ height: at + 1, day, caller: A })));
    const { calls, latest } = callsOf(db, A);
    expect(calls?.days).toHaveLength(30);
    expect(calls?.days[0]?.day).toBe("2026-10-02");
    expect(calls?.total).toBe(31);
    expect(latest).toHaveLength(8);
  });
});

describe("a person's system", () => {
  it("lists the worlds whose realm they deployed, five at most, and how many more", () => {
    const six = Array.from({ length: 6 }, (_, at) => ({
      id: `w${String(at)}`,
      realms: [realm(`gno.land/r/w${String(at)}/x`, A)],
    }));
    const mine = systemOf(worlds(...six, { id: "other", realms: [realm("gno.land/r/other/x", B)] }), A);
    expect(mine.worlds).toHaveLength(5);
    expect(mine.more).toBe(1);
    expect(systemOf(undefined, A)).toEqual({ worlds: [], more: 0 });
  });
});

describe("the node's account answer", () => {
  it.each([
    ['{"BaseAccount":{"coins":"275208694ugnot,5foo"}}', { state: "ok", ugnot: "275208694" }],
    ['{"coins":""}', { state: "ok", ugnot: "0" }],
    ['{"coins":"7/gno.land/r/demo/foo:bar,5ugnot"}', { state: "ok", ugnot: "5" }],
    ["null", { state: "none" }],
    ["", { state: "none" }],
  ] as [string, Balance][])("reads %s", (text, balance) => {
    expect(balanceOf(text)).toEqual(balance);
  });

  it.each(['{"coins":"<script>ugnot"}', '{"coins":"99999999999999999999ugnot"}', "[1]", "not json", '{"coins":7}'])(
    "refuses %s",
    (text) => {
      expect(() => balanceOf(text)).toThrow();
    },
  );
});

const envelope = (coins: string) => ({
  result: {
    response: { ResponseBase: { Error: null, Data: Buffer.from(JSON.stringify({ coins })).toString("base64") } },
  },
});

describe("the balance reader", () => {
  it("reads an address once a minute and refuses the balance past one read a second", async () => {
    let reads = 0;
    let down = false;
    const clock = { now: NOW };
    const read = balanceReader({
      rpc: "https://rpc.example",
      now: () => clock.now,
      perSecond: 1,
      send: () => {
        reads += 1;
        return Promise.resolve(down ? new Response("x", { status: 500 }) : Response.json(envelope("5ugnot")));
      },
    });
    expect(await read(A)).toEqual({ state: "ok", ugnot: "5" });
    expect(await read(A)).toEqual({ state: "ok", ugnot: "5" });
    expect(reads).toBe(1);
    expect(await read(B)).toEqual({ state: "unavailable" });
    expect(reads).toBe(1);
    clock.now += 1000;
    down = true;
    expect(await read(B)).toEqual({ state: "unavailable" });
    expect(reads).toBe(2);
    clock.now += 60_000;
    expect(await read(A)).toEqual({ state: "unavailable" });
  });
});

function setup(perSecond = 1000, tokens = 0) {
  const db = filled([{ height: 1, day: "2026-11-10", caller: A }]);
  for (let at = 0; at < tokens; at++) {
    const token = `gno.land/r/t/t${String(at)}.T${String(at)}.0a`;
    db.prepare("INSERT INTO grc20_tokens VALUES (?, 'h', ?, 'n', 6, '9', 1, 0, NULL, NULL)").run(
      token,
      `T${String(at)}`,
    );
    db.prepare("INSERT INTO grc20_balances VALUES (?, ?, ?)").run(token, A, String(at + 1));
  }
  const app = makeApp(
    () => undefined,
    () => true,
  );
  app.route(
    "/api/people",
    peopleRoutes({
      db,
      worlds: () => worlds({ id: "crowd", realms: [realm("gno.land/r/crowd/app", A)] }),
      balance: () => Promise.resolve({ state: "ok", ugnot: "275208694" }),
      log: () => undefined,
      now: () => NOW,
      perSecond,
    }),
  );
  return (path: string, peer = "203.0.113.7") =>
    app.request(path, {}, { incoming: { socket: { remoteAddress: peer } } });
}

describe("GET /api/people/<address>", () => {
  it("answers the card's blocks, parsed by the schema", async () => {
    const answer = await setup()(`/api/people/${A}`);
    expect(answer.status).toBe(200);
    const card = PersonCardData.parse(await answer.json());
    expect(card.balance).toEqual({ state: "ok", ugnot: "275208694" });
    expect(card.system.worlds).toHaveLength(1);
    expect(card.calls?.total).toBe(1);
  });

  it("answers the person's top 5 tokens by amount, no more", async () => {
    const card = PersonCardData.parse(await (await setup(1000, 7)(`/api/people/${A}`)).json());
    expect(card.tokens.map(({ symbol }) => symbol)).toEqual(["T6", "T5", "T4", "T3", "T2"]);
  });

  it.each(["", "g1", A.toUpperCase(), `${A}x`, "%3Cscript%3E"])("refuses the address %j", async (address) => {
    expect((await setup()(`/api/people/${address}`)).status).toBeGreaterThanOrEqual(400);
  });

  it("ignores a query string", async () => {
    expect((await setup()(`/api/people/${A}?x=<script>`)).status).toBe(200);
  });

  it("counts every visitor together: the 3rd card of a second at 2 a second is refused", async () => {
    const ask = setup(2);
    expect((await ask(`/api/people/${A}`, "203.0.113.1")).status).toBe(200);
    expect((await ask(`/api/people/${A}`, "203.0.113.2")).status).toBe(200);
    expect((await ask(`/api/people/${A}`, "203.0.113.3")).status).toBe(429);
  });

  it("counts 30 a minute a visitor", async () => {
    const ask = setup();
    for (let at = 0; at < 30; at += 1) expect((await ask(`/api/people/${A}`)).status).toBe(200);
    expect((await ask(`/api/people/${A}`)).status).toBe(429);
  });
});

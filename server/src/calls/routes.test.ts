import { CallDetail } from "@gnoworld/schemas";
import { logger } from "@gnoworld/service/log";
import { describe, expect, it } from "vitest";
import { makeApp } from "../app.ts";
import { fakeChain, INDEXER, withBlocks } from "../testing/fakeWorldsChain.ts";
import { ABSENT_MS, callRoutes } from "./routes.ts";

// GET /api/calls/<hash>/<index>: a public door to the indexer, so its hash is checked first, its answer is read under a byte cap and a
// schema, a stranger's text is stripped and cut, an answer is kept by hash, and the reads are limited.
const ORIGIN = "https://gnoworld.test";
const HASH = "ee2jB-mHq8SSTv19Z50gOsyXAJnhW2MqTn_JhkErVss";
const CALLER = "g10gh7yq7swv77efwfcqy2znp37cmeughxx3y5tv";
const REALM = "gno.land/r/gov/dao";
const bidi = String.fromCodePoint(0x202e);

const call = (over: Record<string, unknown> = {}, message: Record<string, unknown> = {}) => ({
  block_height: 1075087,
  success: true,
  gas_wanted: 4072728,
  gas_used: 3132928,
  gas_fee: { amount: 8146, denom: "ugnot" },
  memo: "a memo",
  messages: [
    {
      value: {
        __typename: "MsgCall",
        caller: CALLER,
        pkg_path: REALM,
        func: "Vote",
        args: ["1"],
        send: "",
        ...message,
      },
    },
  ],
  response: { error: "", events: [{ __typename: "GnoEvent", type: "Voted", attrs: [{ key: "id", value: "1" }] }] },
  ...over,
});
const answer = (row: unknown) => JSON.stringify({ data: { getTransactions: row === null ? null : [row] } });

function setup(row: unknown, { perSecond = 10, indexer = (text: string): string | Response => text } = {}) {
  const clock = { now: Date.parse("2026-11-12T12:00:00Z") };
  const chain = fakeChain({
    indexer: withBlocks(
      () => indexer(answer(row)),
      () => "2026-11-12T03:59:00Z",
    ),
  });
  const app = makeApp(
    logger("a-pepper-of-forty-characters-0123456789", () => undefined),
    () => true,
  );
  app.route(
    "/api/calls",
    callRoutes({
      indexer: INDEXER,
      origins: [ORIGIN],
      log: () => undefined,
      now: () => clock.now,
      send: chain.send,
      perSecond,
    }),
  );
  const ask = async (path: string, peer = "203.0.113.7") =>
    await app.request(`/api/calls/${path}`, {}, { incoming: { socket: { remoteAddress: peer } } });
  return { chain, clock, ask };
}

describe("a call's detail", () => {
  it("answers the call with its time, cost, arguments and events, and reads the indexer once for a hash asked twice", async () => {
    const { ask, chain } = setup(call());
    const first = await ask(HASH);
    expect(first.status).toBe(200);
    const detail = CallDetail.parse(await first.json());
    expect(detail).toMatchObject({
      height: 1075087,
      time: "2026-11-12T03:59:00.000Z",
      func: "Vote",
      args: ["1"],
      moreArgs: 0,
    });
    expect(detail.events).toEqual([{ type: "Voted", attrs: [{ key: "id", value: "1" }] }]);
    const reads = chain.asked.length;
    expect((await ask(HASH)).status).toBe(200);
    expect(chain.asked).toHaveLength(reads);
  });

  it.each(["short", `${HASH}=`, `${HASH.slice(0, 42)}%3C`, `${HASH}/x`, `${HASH}/100`])(
    "refuses the hash or index %s before any read",
    async (path) => {
      const { ask, chain } = setup(call());
      expect((await ask(path)).status).toBe(400);
      expect(chain.asked).toHaveLength(0);
    },
  );

  it("answers 404 for a hash the indexer does not hold, and asks again only after a few seconds", async () => {
    const { ask, chain, clock } = setup(null);
    expect((await ask(HASH)).status).toBe(404);
    expect((await ask(HASH)).status).toBe(404);
    expect(chain.asked).toHaveLength(1);
    clock.now += ABSENT_MS + 1;
    await ask(HASH);
    expect(chain.asked).toHaveLength(2);
  });

  it("answers 404 for a message that is no call", async () => {
    const { ask } = setup(call({}, { __typename: "BankMsgSend" }));
    expect((await ask(HASH)).status).toBe(404);
  });

  it("strips and cuts a stranger's text: markup stays text, bidi goes, 500 arguments are 10 and a count", async () => {
    const hostile = call(
      { memo: `<img src=x onerror=1>${bidi}${"m".repeat(1000)}`, response: { error: `bad${bidi}`, events: [] } },
      { args: Array.from({ length: 500 }, (_, i) => `<b>${bidi}${"a".repeat(i === 0 ? 5000 : 1)}`) },
    );
    const { ask } = setup(hostile);
    const detail = CallDetail.parse(await (await ask(HASH)).json());
    expect(detail.args).toHaveLength(10);
    expect(detail.moreArgs).toBe(490);
    expect(detail.args[0]).toHaveLength(200);
    expect(JSON.stringify(detail)).not.toContain(bidi);
    expect(detail.memo?.startsWith("<img")).toBe(true);
    expect(detail.memo).toHaveLength(140);
    expect(detail.error).toBe("bad");
  });

  it("answers 503 for an answer past the byte cap and for one of the wrong shape, caching neither", async () => {
    const big = setup(call(), { indexer: () => "x".repeat(10_000_000) });
    expect((await big.ask(HASH)).status).toBe(503);
    const bad = setup(call({ gas_used: "3" }));
    expect((await bad.ask(HASH)).status).toBe(503);
    await bad.ask(HASH);
    expect(bad.chain.asked).toHaveLength(2);
  });

  it("limits a visitor to 30 a minute and every visitor's indexer reads to a few a second", async () => {
    const { ask } = setup(call(), { perSecond: 3 });
    const other = (i: number) => `${HASH.slice(0, 42)}${String(i)}`;
    const statuses = await Promise.all([1, 2, 3, 4].map((i) => ask(other(i), `198.51.100.${String(i)}`)));
    expect(statuses.map(({ status }) => status)).toEqual([200, 200, 200, 429]);
    const one = setup(call(), { perSecond: 1000 });
    const each = [];
    for (let i = 0; i < 31; i += 1) each.push((await one.ask(HASH)).status);
    expect(each.at(-1)).toBe(429);
    expect(each.at(-2)).toBe(200);
  });

  it("spends the site-wide limit on reads only: kept calls and a read already running cost it nothing", async () => {
    const { ask, chain } = setup(call(), { perSecond: 1 });
    expect((await ask(HASH, "198.51.100.1")).status).toBe(200);
    const again = await Promise.all([2, 3, 4, 5].map((i) => ask(HASH, `198.51.100.${String(i)}`)));
    expect(again.map(({ status }) => status)).toEqual([200, 200, 200, 200]);
    const fresh = setup(call(), { perSecond: 1 });
    const same = await Promise.all([1, 2, 3].map((i) => fresh.ask(HASH, `198.51.100.${String(i)}`)));
    expect(same.map(({ status }) => status)).toEqual([200, 200, 200]);
    expect(fresh.chain.asked.length).toBeLessThanOrEqual(chain.asked.length);
  });

  it("keeps one call under one key whatever the index is typed as", async () => {
    const { ask, chain } = setup(call());
    await ask(`${HASH}/7`);
    const reads = chain.asked.length;
    await ask(`${HASH}/07`);
    expect(chain.asked).toHaveLength(reads);
  });
});

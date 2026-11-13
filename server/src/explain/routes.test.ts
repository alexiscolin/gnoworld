import { Explanation } from "@gnoworld/schemas";
import { openDatabase } from "@gnoworld/service/db";
import { describe, expect, it, vi } from "vitest";
import { migrations } from "../migrations.ts";
import { makeExplainer } from "./make.ts";
import { explainRoutes } from "./routes.ts";
import { makeExplanations } from "./store.ts";

const peer = { incoming: { socket: { remoteAddress: "203.0.113.7" } } };
const REALM = "gno.land/r/demo/defi/grc20factory";
const url = (kind: string, chain: string, subject: string) => `/${kind}/${chain}/${encodeURIComponent(subject)}`;
const setup = (answer: Explanation = { status: "making" }) => {
  const explainer = {
    answer: vi.fn(() => answer),
    ready: vi.fn(() => (answer.status === "ready" ? answer : undefined)),
  };
  const clock = { now: 0 };
  const routes = explainRoutes({ explainer, now: () => clock.now });
  return { explainer, clock, routes };
};

describe("GET /<kind>/<chain>/<subject>", () => {
  it("answers what the explainer says for the realm, in the page's own schema", async () => {
    const { routes, explainer } = setup({ status: "ready", text: "A token.", tags: ["token"] });
    const response = await routes.request(url("realm", "onyx-1", REALM), {}, peer);
    expect(response.status).toBe(200);
    const body: unknown = await response.json();
    expect(body).toEqual({ status: "ready", text: "A token.", tags: ["token"] });
    expect(explainer.answer).toHaveBeenCalledWith(
      { kind: "realm", chain: "onyx-1", subject: REALM },
      expect.any(String),
    );
    expect(Explanation.safeParse(body).success).toBe(true);
  });

  it("answers a world's by its main realm's path as its own kind", async () => {
    const { routes, explainer } = setup();
    await routes.request(url("world", "onyx-1", REALM), {}, peer);
    expect(explainer.answer).toHaveBeenCalledWith(
      { kind: "world", chain: "onyx-1", subject: REALM },
      expect.any(String),
    );
  });

  it("caches a ready line for the browser and nothing else", async () => {
    expect(
      (
        await setup({ status: "ready", text: "A.", tags: [] }).routes.request(url("realm", "onyx-1", REALM), {}, peer)
      ).headers.get("cache-control"),
    ).toBe("public, max-age=300");
    for (const answer of [{ status: "making" }, { status: "none" }] as const) {
      expect(
        (await setup(answer).routes.request(url("realm", "onyx-1", REALM), {}, peer)).headers.get("cache-control"),
      ).toBe("no-store");
    }
  });

  it.each([
    { name: "a kind it has none of", kind: "scam", chain: "onyx-1", subject: REALM },
    { name: "a chain id of the wrong shape", kind: "realm", chain: "ONYX_1", subject: REALM },
    { name: "a package that is no realm", kind: "realm", chain: "onyx-1", subject: "gno.land/p/demo/x" },
    { name: "a path with a dot-dot", kind: "realm", chain: "onyx-1", subject: "gno.land/r/../x" },
    { name: "a subject too long", kind: "realm", chain: "onyx-1", subject: `gno.land/r/${"a".repeat(200)}` },
    { name: "a subject with markup", kind: "realm", chain: "onyx-1", subject: "gno.land/r/<script>" },
  ])("refuses $name before any work", async ({ kind, chain, subject }) => {
    const { routes, explainer } = setup();
    const response = await routes.request(url(kind, chain, subject), {}, peer);
    expect(response.status).toBe(400);
    expect(await response.json()).toEqual({ error: "refused" });
    expect(explainer.answer).not.toHaveBeenCalled();
  });

  it("holds each visitor to 60 a minute and every visitor together to 20 a second, before any work", async () => {
    const { routes, explainer } = setup({ status: "none" });
    const statuses: number[] = [];
    for (let n = 0; n < 25; n += 1)
      statuses.push((await routes.request(url("realm", "onyx-1", REALM), {}, peer)).status);
    expect(statuses.filter((status) => status === 200)).toHaveLength(20);
    expect(statuses.at(-1)).toBe(429);
    expect(explainer.answer).toHaveBeenCalledTimes(20);
  });

  it("serves a line already made while every visitor together is past 20 a second, and starts nothing then", async () => {
    const made = setup({ status: "ready", text: "A token.", tags: ["token"] });
    const statuses: number[] = [];
    for (let n = 0; n < 22; n += 1)
      statuses.push((await made.routes.request(url("realm", "onyx-1", REALM), {}, peer)).status);
    expect(statuses).toEqual(Array.from({ length: 22 }, () => 200));
    expect(made.explainer.answer).toHaveBeenCalledTimes(20);
    const miss = setup({ status: "none" });
    for (let n = 0; n < 20; n += 1) await miss.routes.request(url("realm", "onyx-1", REALM), {}, peer);
    expect((await miss.routes.request(url("realm", "onyx-1", REALM), {}, peer)).status).toBe(429);
    expect(miss.explainer.answer).toHaveBeenCalledTimes(20);
  });

  it("holds one visitor to 60 a minute, counting a refused request, and serves another visitor", async () => {
    const { routes, clock } = setup({ status: "none" });
    const first: number[] = [];
    for (let n = 0; n < 61; n += 1) {
      clock.now = n * 900;
      first.push((await routes.request(url("realm", "onyx-1", REALM), {}, peer)).status);
    }
    expect(first.slice(0, 60).every((status) => status === 200)).toBe(true);
    expect(first[60]).toBe(429);
    const other = { incoming: { socket: { remoteAddress: "203.0.113.8" } } };
    expect((await routes.request(url("realm", "onyx-1", REALM), {}, other)).status).toBe(200);
    const third = { incoming: { socket: { remoteAddress: "203.0.113.9" } } };
    for (let n = 0; n < 59; n += 1) {
      clock.now = 60_000 + n * 900;
      await routes.request(url("realm", "onyx-1", REALM), {}, third);
    }
    expect((await routes.request(url("scam", "onyx-1", REALM), {}, third)).status).toBe(400);
    expect((await routes.request(url("realm", "onyx-1", REALM), {}, third)).status).toBe(429);
  });
});

describe("the new explanations one visitor starts, counted by its /48", () => {
  it("six visitors in one /48: the sixth is refused", async () => {
    const db = openDatabase(":memory:", migrations);
    const explainer = makeExplainer({
      store: makeExplanations(db),
      jarvis: { explain: () => new Promise(() => undefined) },
      known: () => true,
      now: () => 0,
      log: () => undefined,
      perDay: 30,
      gapMs: 0,
    });
    const routes = explainRoutes({ explainer, now: () => 0 });
    const statuses: unknown[] = [];
    for (let n = 1; n <= 6; n += 1) {
      const from = { incoming: { socket: { remoteAddress: `2001:db8:1:${String(n)}::1` } } };
      const answer = await routes.request(url("realm", "onyx-1", `gno.land/r/demo/r${String(n)}`), {}, from);
      statuses.push(Explanation.parse(await answer.json()).status);
    }
    expect(statuses).toEqual(["making", "making", "making", "making", "making", "none"]);
    db.close();
  });
});

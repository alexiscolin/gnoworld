import { describe, expect, it } from "vitest";
import type { Fetcher } from "./http.ts";
import { signalsApi } from "./signals.ts";

// Slice 9h: the browser's client of the first signals (server/src/signals/routes.ts, mounted at /api/signals), through
// the one JSON call of lib/api/http.ts. Each answer must name the world asked.
const ALICE = "g10gh7yq7swv77efwfcqy2znp37cmeughxx3y5tv";
const AT = "2026-11-05T12:00:00.000Z";

const server = (answer: { status: number; json?: unknown }) => {
  const sent: { url: string; init: RequestInit }[] = [];
  const fetcher: Fetcher = (url, init = {}) => {
    sent.push({ url, init });
    const body = answer.json === undefined ? null : JSON.stringify(answer.json);
    return Promise.resolve(
      new Response(body, { status: answer.status, headers: { "content-type": "application/json" } }),
    );
  };
  return { api: signalsApi(fetcher), sent };
};

describe("charting a world, from the browser", () => {
  it("POSTs the world alone to /api/signals/chart, the cookie to this site, no redirect followed", async () => {
    const { api, sent } = server({ status: 200, json: { world: "govdao", first: true } });
    expect(await api.chart("govdao")).toEqual({ ok: true, value: { world: "govdao", first: true } });
    expect(sent).toHaveLength(1);
    expect(sent[0]?.url).toBe("/api/signals/chart");
    expect(sent[0]?.init).toMatchObject({ method: "POST", credentials: "same-origin", redirect: "error" });
    const body = sent[0]?.init.body;
    expect(JSON.parse(typeof body === "string" ? body : "")).toEqual({ world: "govdao" });
  });

  it("sends nothing for a world that is no slug", async () => {
    const { api, sent } = server({ status: 200, json: { world: "x", first: true } });
    expect(await api.chart("../x")).toEqual({ ok: false, reason: "refused" });
    expect(sent).toEqual([]);
  });

  it("says why it failed: a guest's 401 and the rate's 429", async () => {
    expect(await server({ status: 401, json: { error: "unauthenticated" } }).api.chart("govdao")).toEqual({
      ok: false,
      reason: "unauthenticated",
    });
    expect(await server({ status: 429, json: { error: "too_many" } }).api.chart("govdao")).toEqual({
      ok: false,
      reason: "too_many",
    });
  });

  it("takes an answer for another world, or of another shape, as malformed", async () => {
    expect(await server({ status: 200, json: { world: "bubble", first: true } }).api.chart("govdao")).toEqual({
      ok: false,
      reason: "malformed",
    });
    expect(await server({ status: 200, json: { world: "govdao", first: "yes" } }).api.chart("govdao")).toEqual({
      ok: false,
      reason: "malformed",
    });
  });
});

describe("who is first, from the browser", () => {
  const FIRSTS = { world: "govdao", charted: { account: ALICE, at: AT }, words: null };

  it("asks GET /api/signals for the world, with no body", async () => {
    const { api, sent } = server({ status: 200, json: FIRSTS });
    expect(await api.firsts("govdao")).toEqual({ ok: true, value: FIRSTS });
    expect(sent[0]?.url).toBe("/api/signals?world=govdao");
    expect(sent[0]?.init).toMatchObject({ method: "GET", credentials: "same-origin", redirect: "error" });
    expect(sent[0]?.init.body).toBeUndefined();
  });

  it("takes an answer for another world, or with an account that is no address, as malformed", async () => {
    expect(await server({ status: 200, json: { ...FIRSTS, world: "bubble" } }).api.firsts("govdao")).toEqual({
      ok: false,
      reason: "malformed",
    });
    const hostile = { ...FIRSTS, charted: { account: "<img src=x onerror=alert(1)>", at: AT } };
    expect(await server({ status: 200, json: hostile }).api.firsts("govdao")).toEqual({
      ok: false,
      reason: "malformed",
    });
  });
});

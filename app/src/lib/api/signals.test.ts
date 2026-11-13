import { describe, expect, it } from "vitest";
import type { Fetcher } from "./http.ts";
import { signalsApi } from "./signals.ts";

// Slice 9h: the browser's client of the first signals (server/src/signals/routes.ts, mounted at /api/signals), through
// the one JSON call of lib/api/http.ts. Each answer must name the world asked.

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
      body: { error: "unauthenticated" },
    });
    expect(await server({ status: 429, json: { error: "too_many" } }).api.chart("govdao")).toEqual({
      ok: false,
      reason: "too_many",
      body: { error: "too_many" },
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

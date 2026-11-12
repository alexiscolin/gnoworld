import { Explanation } from "@gnoworld/schemas";
import { describe, expect, it, vi } from "vitest";
import { explainRoutes } from "./routes.ts";

const peer = { incoming: { socket: { remoteAddress: "203.0.113.7" } } };
const REALM = "gno.land/r/demo/defi/grc20factory";
const url = (kind: string, chain: string, subject: string) => `/${kind}/${chain}/${encodeURIComponent(subject)}`;
const setup = (answer: Explanation = { status: "making" }) => {
  const explainer = { answer: vi.fn(() => answer) };
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
    expect(explainer.answer).toHaveBeenCalledWith({ kind: "realm", chain: "onyx-1", subject: REALM });
    expect(Explanation.safeParse(body).success).toBe(true);
  });

  it("answers a world's by its main realm's path as its own kind", async () => {
    const { routes, explainer } = setup();
    await routes.request(url("world", "onyx-1", REALM), {}, peer);
    expect(explainer.answer).toHaveBeenCalledWith({ kind: "world", chain: "onyx-1", subject: REALM });
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

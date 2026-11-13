import { describe, expect, it } from "vitest";
import type { TokenAnswer } from "@gnoworld/schemas/indexer";
import { tokenRoutes } from "./tokenRoutes.ts";

const HASH = "0123456789abcdef0123456789abcdef";
const answer: TokenAnswer = { height: 9, tokens: [] };
const peer = { incoming: { socket: { remoteAddress: "203.0.113.7" } } };
const routes = (now = () => 0) => tokenRoutes({ answer: (hash) => (hash === HASH ? answer : undefined), now });

describe("GET /api/tokens/:hash", () => {
  it("answers a realm's tokens for a minute, and a 404 for an unknown hash or a text that is no hash", async () => {
    const app = routes();
    const found = await app.request(`/${HASH}`, {}, peer);
    expect(found.status).toBe(200);
    expect(found.headers.get("cache-control")).toBe("public, max-age=60");
    expect(await found.json()).toEqual(answer);
    expect((await app.request(`/${"f".repeat(32)}`, {}, peer)).status).toBe(404);
    expect((await app.request(`/${"A".repeat(32)}`, {}, peer)).status).toBe(404);
    expect((await app.request(`/${"a".repeat(5000)}`, {}, peer)).status).toBe(404);
  });

  it("holds a visitor to 60 requests a minute", async () => {
    const clock = { at: 0 };
    const app = routes(() => (clock.at += 100));
    const statuses = [];
    for (let at = 0; at < 61; at += 1) statuses.push((await app.request(`/${HASH}`, {}, peer)).status);
    expect(statuses.filter((status) => status === 429)).toHaveLength(1);
  });
});

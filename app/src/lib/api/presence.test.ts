import { describe, expect, it } from "vitest";
import { presenceApi } from "./presence.ts";

// The browser's client of who is here (server/src/worlds/present.ts, at /api/presence), through lib/api/http.ts's one call: its answer
// read through the schema, or why not.
const answer = { worlds: [{ world: "earth", here: 12, perHour: 30, rise: null }] };
const replying = (status: number, body: string) => (url: string) =>
  Promise.resolve(Object.assign(new Response(body, { status }), { asked: url }));

describe("presenceApi", () => {
  it("reads who is here at the server's own path: a GET, its cookie to this site alone, a redirect refused", async () => {
    const asked: [string, RequestInit | undefined][] = [];
    const api = presenceApi((url, init) => {
      asked.push([url, init]);
      return replying(200, JSON.stringify(answer))(url);
    });
    expect(await api.read()).toEqual({ ok: true, value: answer });
    expect(asked.map(([url]) => url)).toEqual(["/api/presence"]);
    expect(asked[0]?.[1]).toMatchObject({ method: "GET", credentials: "same-origin", redirect: "error" });
  });

  it("refuses an answer that is no JSON", async () => {
    expect(await presenceApi(replying(200, "<html>")).read()).toEqual({ ok: false, reason: "malformed" });
  });

  it("refuses an answer that is not the schema's, a name among the counts", async () => {
    const named = { worlds: [{ ...answer.worlds[0], who: "ada" }] };
    expect(await presenceApi(replying(200, JSON.stringify(named))).read()).toEqual({ ok: false, reason: "malformed" });
  });

  it("says a server that is down, and a network that failed", async () => {
    expect(await presenceApi(replying(503, "")).read()).toEqual({ ok: false, reason: "unavailable" });
    expect(await presenceApi(() => Promise.reject(new TypeError("offline"))).read()).toEqual({
      ok: false,
      reason: "network",
    });
  });
});

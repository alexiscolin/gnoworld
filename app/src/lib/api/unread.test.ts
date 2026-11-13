import { describe, expect, it } from "vitest";
import type { Fetcher } from "./http.ts";
import { unreadApi } from "./unread.ts";

// The browser's client of each world's unread count (server/src/unread/routes.ts, mounted at /api/unread): the answer through its schema,
// a place sent only in the shape the server takes.
const server = (answer: { status: number; json?: unknown }) => {
  const sent: { url: string; init: RequestInit }[] = [];
  const fetcher: Fetcher = (url, init = {}) => {
    sent.push({ url, init });
    const body = answer.json === undefined ? null : JSON.stringify(answer.json);
    return Promise.resolve(new Response(body, { status: answer.status }));
  };
  return { api: unreadApi(fetcher), sent };
};

describe("the unread client's counts", () => {
  it("reads each world's count from /api/unread", async () => {
    const { api, sent } = server({ status: 200, json: { worlds: { bubble: 3 } } });
    expect(await api.counts()).toEqual({ ok: true, value: { worlds: { bubble: 3 } } });
    expect(sent.map(({ url }) => url)).toEqual(["/api/unread"]);
  });

  it("calls an answer that breaks the schema malformed, and a refusal by its reason", async () => {
    expect(await server({ status: 200, json: { worlds: { bubble: 500 } } }).api.counts()).toEqual({
      ok: false,
      reason: "malformed",
    });
    expect(await server({ status: 401, json: { error: "unauthenticated" } }).api.counts()).toMatchObject({
      ok: false,
      reason: "unauthenticated",
    });
  });
});

describe("the unread client's places", () => {
  const PLACES = [{ room: "#bubble", time: "2026-11-13T10:00:00.000Z" }];

  it("posts the places as JSON to /api/unread and takes a 204", async () => {
    const { api, sent } = server({ status: 204 });
    expect((await api.places(PLACES)).ok).toBe(true);
    expect(sent[0]?.init.method).toBe("POST");
    expect(sent[0]?.init.body).toBe(JSON.stringify({ places: PLACES }));
  });

  it("sends nothing for no place, a hundred and one, or a room that is no room", async () => {
    const { api, sent } = server({ status: 204 });
    const many = Array.from({ length: 101 }, (_, n) => ({ room: `#room${String(n)}`, time: PLACES[0]?.time ?? "" }));
    for (const bad of [[], many, [{ room: "bubble", time: PLACES[0]?.time ?? "" }]])
      expect(await api.places(bad)).toEqual({ ok: false, reason: "refused" });
    expect(sent).toEqual([]);
  });
});

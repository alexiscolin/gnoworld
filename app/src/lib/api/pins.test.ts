import { describe, expect, it } from "vitest";
import type { Fetcher } from "./http.ts";
import { pinsApi } from "./pins.ts";

// The browser's client of a room's pins (server/src/pins/routes.ts, mounted at /api/pins; slice 4's 4d), through the
// one JSON call of lib/api/http.ts: GET for the pins, POST to pin and to unpin. The answer must name the room asked.
const ALICE = "g10gh7yq7swv77efwfcqy2znp37cmeughxx3y5tv";
const LIST = {
  room: "#bubble/games",
  may: true,
  pins: [{ id: "m1", time: "2026-10-25T10:00:00.000Z", account: ALICE, text: "Welcome." }],
};

// A server that answers as told, and keeps what it was asked.
const server = (answer: { status: number; json?: unknown }) => {
  const sent: { url: string; init: RequestInit }[] = [];
  const fetcher: Fetcher = (url, init = {}) => {
    sent.push({ url, init });
    const body = answer.json === undefined ? null : JSON.stringify(answer.json);
    return Promise.resolve(
      new Response(body, { status: answer.status, headers: { "content-type": "application/json" } }),
    );
  };
  return { api: pinsApi(fetcher), sent };
};

// The JSON a call sent.
const sentBody = (call: { init: RequestInit } | undefined): unknown => {
  const body = call?.init.body;
  if (typeof body !== "string") throw new Error("no JSON body was sent");
  return JSON.parse(body);
};

describe("a room's pins, from the server", () => {
  it("asks GET /api/pins for the room, the cookie to this site alone, no redirect followed, no body", async () => {
    const { api, sent } = server({ status: 200, json: LIST });
    expect(await api.pins("#bubble/games")).toEqual({ ok: true, value: LIST });
    expect(sent).toHaveLength(1);
    expect(sent[0]?.url).toBe("/api/pins?room=%23bubble%2Fgames");
    expect(sent[0]?.init).toMatchObject({ method: "GET", credentials: "same-origin", redirect: "error" });
    expect(sent[0]?.init.body).toBeUndefined();
  });

  it("POSTs the room and the line's id alone to pin, and says what the server answers", async () => {
    const { api, sent } = server({ status: 200, json: LIST });
    expect(await api.pin("#bubble/games", "m1")).toEqual({ ok: true, value: LIST });
    expect(sent[0]?.url).toBe("/api/pins");
    expect(sent[0]?.init).toMatchObject({ method: "POST", credentials: "same-origin", redirect: "error" });
    expect(sentBody(sent[0])).toEqual({ room: "#bubble/games", msgid: "m1" });
  });

  it("POSTs to /api/pins/unpin to unpin", async () => {
    const { api, sent } = server({ status: 200, json: { ...LIST, pins: [] } });
    expect(await api.unpin("#bubble/games", "m1")).toEqual({ ok: true, value: { ...LIST, pins: [] } });
    expect(sent[0]?.url).toBe("/api/pins/unpin");
    expect(sentBody(sent[0])).toEqual({ room: "#bubble/games", msgid: "m1" });
  });

  // The server's codes, as a page acts on them: a pin it may not make, a line gone, a room full.
  it.each([
    [401, "unauthenticated"],
    [403, "forbidden"],
    [404, "not_found"],
    [429, "too_many"],
    [409, "full"],
    [503, "not_ready"],
    [400, "refused"],
  ] as const)("reads a %i as %s", async (status, error) => {
    expect(await server({ status, json: { error } }).api.pin("#bubble/games", "m1")).toEqual({
      ok: false,
      reason: error,
      body: { error },
    });
  });

  it("reads a server that failed as unavailable", async () => {
    expect(await server({ status: 502 }).api.pins("#bubble")).toEqual({ ok: false, reason: "unavailable" });
  });

  it.each([
    ["another room's pins", { ...LIST, room: "#bubble" }],
    ["a pin with a field it does not know", { ...LIST, pins: [{ ...LIST.pins[0], by: ALICE }] }],
    ["a pin with an author that is no address", { ...LIST, pins: [{ ...LIST.pins[0], account: "alice" }] }],
    [
      "eleven pins",
      { ...LIST, pins: Array.from({ length: 11 }, (_, n) => ({ ...LIST.pins[0], id: `m${String(n)}` })) },
    ],
    ["no right to pin", { room: LIST.room, pins: [] }],
  ])("refuses an answer with %s as malformed, for every call", async (_, answer) => {
    for (const call of ["pins", "pin", "unpin"] as const) {
      const { api } = server({ status: 200, json: answer });
      expect(await api[call]("#bubble/games", "m1")).toEqual({ ok: false, reason: "malformed" });
    }
  });

  // The room and the id come from the page's own state, but a word that is no room's is never sent.
  it.each([
    ["no room", ""],
    ["a room with a query in it", "#bubble&room=#other"],
    ["a room that is no room's", "bubble"],
    ["a room with a space", "#bub ble"],
  ])("sends nothing for %s", async (_, room) => {
    const { api, sent } = server({ status: 200, json: LIST });
    for (const call of [api.pins(room), api.pin(room, "m1"), api.unpin(room, "m1")])
      expect(await call).toEqual({ ok: false, reason: "refused" });
    expect(sent).toEqual([]);
  });

  it.each([
    ["no id", ""],
    ["an id with a comma", "a,b"],
    ["an id with a space", "a b"],
    ["an id of 129 characters", "m".repeat(129)],
  ])("pins and unpins nothing for %s", async (_, msgid) => {
    const { api, sent } = server({ status: 200, json: LIST });
    for (const call of [api.pin("#bubble", msgid), api.unpin("#bubble", msgid)])
      expect(await call).toEqual({ ok: false, reason: "refused" });
    expect(sent).toEqual([]);
  });
});

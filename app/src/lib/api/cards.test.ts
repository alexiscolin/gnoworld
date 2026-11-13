import { describe, expect, it } from "vitest";
import { cardsApi, pictureOf } from "./cards.ts";
import type { Fetcher } from "./http.ts";

// The browser's client of the link cards (server/src/cards/routes.ts, mounted at /api/cards; link-previews L4): every answer through its
// schema, the picture's address of one shape alone.
const KEY = "a".repeat(64);
const CARD = {
  host: "example.com",
  site: "Example",
  title: "A title",
  description: "Words.",
  picture: { width: 160, height: 90 },
};

const server = (answer: { status: number; json?: unknown }) => {
  const sent: { url: string; init: RequestInit }[] = [];
  const fetcher: Fetcher = (url, init = {}) => {
    sent.push({ url, init });
    const body = answer.json === undefined ? null : JSON.stringify(answer.json);
    return Promise.resolve(
      new Response(body, { status: answer.status, headers: { "content-type": "application/json" } }),
    );
  };
  return { api: cardsApi(fetcher), sent };
};

describe("a card's picture address", () => {
  it("is the card's own route for a key of 64 lower-case hex, and none for any other word", () => {
    expect(pictureOf(KEY)).toBe(`/api/cards/${KEY}/picture`);
    for (const bad of [
      "",
      "A".repeat(64),
      "a".repeat(63),
      "a".repeat(65),
      `../${"a".repeat(61)}`,
      `${KEY}?x=1`,
      `${KEY}/..`,
      "https://evil.example/x.jpg",
    ])
      expect(pictureOf(bad)).toBeUndefined();
  });
});

describe("the cards of a room's lines, from the server", () => {
  it("asks GET /api/cards for the room and the ids, and takes the answer for that room's asked lines", async () => {
    const answer = { room: "#bubble/games", cards: [{ msgid: "m1", key: KEY }] };
    const { api, sent } = server({ status: 200, json: answer });
    expect(await api.lines("#bubble/games", ["m1", "m2"])).toEqual({ ok: true, value: answer });
    expect(sent[0]?.url).toBe("/api/cards?room=%23bubble%2Fgames&ids=m1%2Cm2");
    expect(sent[0]?.init).toMatchObject({ method: "GET", credentials: "same-origin", redirect: "error" });
  });

  it("refuses an answer for another room, or for a line not asked, as malformed", async () => {
    const other = { room: "#other", cards: [] };
    expect(await server({ status: 200, json: other }).api.lines("#bubble", ["m1"])).toEqual({
      ok: false,
      reason: "malformed",
    });
    const stray = { room: "#bubble", cards: [{ msgid: "zz", key: KEY }] };
    expect(await server({ status: 200, json: stray }).api.lines("#bubble", ["m1"])).toEqual({
      ok: false,
      reason: "malformed",
    });
  });

  it("sends nothing for no id or for more than the route takes", async () => {
    const { api, sent } = server({ status: 200, json: { room: "#bubble", cards: [] } });
    expect(await api.lines("#bubble", [])).toEqual({ ok: false, reason: "refused" });
    expect(
      await api.lines(
        "#bubble",
        Array.from({ length: 101 }, (_, n) => `m${String(n)}`),
      ),
    ).toEqual({ ok: false, reason: "refused" });
    expect(sent).toEqual([]);
  });

  it("refuses a key that is not 64 hex in an answer", async () => {
    const bad = { room: "#bubble", cards: [{ msgid: "m1", key: "../x" }] };
    expect(await server({ status: 200, json: bad }).api.lines("#bubble", ["m1"])).toEqual({
      ok: false,
      reason: "malformed",
    });
  });
});

describe("a card's content, from the server", () => {
  it("asks GET /api/cards/<key> and reads the texts and the picture's size", async () => {
    const { api, sent } = server({ status: 200, json: CARD });
    expect(await api.card(KEY)).toEqual({ ok: true, value: CARD });
    expect(sent[0]?.url).toBe(`/api/cards/${KEY}`);
  });

  it("sends nothing for a key of another shape", async () => {
    const { api, sent } = server({ status: 200, json: CARD });
    expect(await api.card("../pins")).toEqual({ ok: false, reason: "refused" });
    expect(sent).toEqual([]);
  });

  // A hostile server or a compromised reader: each must be refused whole, never drawn.
  it.each([
    ["a link of its own", { ...CARD, url: "https://evil.example/" }],
    ["a host with a path", { ...CARD, host: "evil.example/login" }],
    ["a host in capitals", { ...CARD, host: "EVIL.example" }],
    ["a bidi override in the title", { ...CARD, title: "ok\u202egpj.exe" }],
    ["a zero-width character in the site", { ...CARD, site: "a\u200bb" }],
    ["an empty title", { ...CARD, title: "" }],
    ["a title past its cap", { ...CARD, title: "t".repeat(201) }],
    ["a picture as a data URL", { ...CARD, picture: "data:image/jpeg;base64,AAAA" }],
    ["a picture past 160 px", { ...CARD, picture: { width: 161, height: 90 } }],
  ])("refuses an answer with %s", async (_what, json) => {
    expect(await server({ status: 200, json }).api.card(KEY)).toEqual({ ok: false, reason: "malformed" });
  });

  it("reads the server's refusals", async () => {
    expect(await server({ status: 404, json: { error: "not_found" } }).api.card(KEY)).toMatchObject({
      ok: false,
      reason: "not_found",
    });
  });
});

describe("removing a line's card", () => {
  it("POSTs the room and the line's id alone, and reads the event the server answers", async () => {
    const event = { room: "#bubble", msgid: "m1", key: null };
    const { api, sent } = server({ status: 200, json: event });
    expect(await api.remove("#bubble", "m1")).toEqual({ ok: true, value: event });
    expect(sent[0]?.url).toBe("/api/cards/remove");
    expect(sent[0]?.init).toMatchObject({ method: "POST", credentials: "same-origin", redirect: "error" });
    expect(JSON.parse(typeof sent[0]?.init.body === "string" ? sent[0].init.body : "")).toEqual({
      room: "#bubble",
      msgid: "m1",
    });
  });

  it("refuses an answer that names another line, or still holds a key", async () => {
    expect(
      await server({ status: 200, json: { room: "#bubble", msgid: "m2", key: null } }).api.remove("#bubble", "m1"),
    ).toEqual({ ok: false, reason: "malformed" });
    expect(
      await server({ status: 200, json: { room: "#bubble", msgid: "m1", key: KEY } }).api.remove("#bubble", "m1"),
    ).toEqual({ ok: false, reason: "malformed" });
  });

  it("sends nothing for a room or an id the server would refuse", async () => {
    const { api, sent } = server({ status: 200, json: {} });
    expect(await api.remove("not a room", "m1")).toEqual({ ok: false, reason: "refused" });
    expect(await api.remove("#bubble", "")).toEqual({ ok: false, reason: "refused" });
    expect(sent).toEqual([]);
  });

  it("reads a 403 as forbidden", async () => {
    expect(await server({ status: 403, json: { error: "forbidden" } }).api.remove("#bubble", "m1")).toMatchObject({
      ok: false,
      reason: "forbidden",
    });
  });
});

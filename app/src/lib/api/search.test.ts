import { describe, expect, it } from "vitest";
import type { Fetcher } from "./http.ts";
import { marksSound, searchApi } from "./search.ts";

// The browser's client of the chat's search (server/src/search/routes.ts, mounted at /api/search; slice 13, C), through the one JSON
// call of lib/api/http.ts: its words checked before any is sent, its answer read through the schema and refused whole when a mark
// lies outside the text it marks (a server answer is parsed, never trusted).
const ALICE = "g10gh7yq7swv77efwfcqy2znp37cmeughxx3y5tv";
const HIT = {
  room: "#bubble/games",
  msgid: "m1",
  account: ALICE,
  at: 1_762_000_000_000,
  text: "the quorum stays",
  marks: [[4, 10]],
  link: false,
};
const PAGE = { hits: [HIT], next: "7", total: 1, capped: false, partial: false };

const server = (answer: { status: number; json?: unknown }) => {
  const sent: { url: string; init: RequestInit }[] = [];
  const fetcher: Fetcher = (url, init = {}) => {
    sent.push({ url, init });
    const body = answer.json === undefined ? null : JSON.stringify(answer.json);
    return Promise.resolve(
      new Response(body, { status: answer.status, headers: { "content-type": "application/json" } }),
    );
  };
  return { api: searchApi(fetcher), sent };
};

const ask = { q: "quorum", world: "bubble" };

describe("the chat's search, from the server", () => {
  it("asks GET /api/search with the words and what narrows them, the cookie to this site alone, no redirect followed", async () => {
    const { api, sent } = server({ status: 200, json: PAGE });
    const room = "#bubble/games";
    const query = {
      ...ask,
      room,
      from: ALICE,
      link: "1",
      since: "2026-11-01T00:00:00Z",
      before: "7",
    } as const;
    expect(await api.search(query)).toEqual({ ok: true, value: PAGE });
    const url = new URL(sent[0]?.url ?? "", "https://x.test");
    expect(url.pathname).toBe("/api/search");
    expect(Object.fromEntries(url.searchParams)).toEqual({ ...query });
    expect(sent[0]?.init).toMatchObject({ method: "GET", credentials: "same-origin", redirect: "error" });
    expect(sent[0]?.init.body).toBeUndefined();
  });

  it("sends the words as the server reads them (after NFKC), and no parameter that was not given", async () => {
    const { api, sent } = server({ status: 200, json: PAGE });
    await api.search({ q: "  ｑuorum  ", world: "bubble" });
    expect(Object.fromEntries(new URL(sent[0]?.url ?? "", "https://x.test").searchParams)).toEqual({
      q: "quorum",
      world: "bubble",
    });
  });

  it.each([
    ["a word of one character", { q: "a", world: "bubble" }],
    ["words with a control character", { q: "quo\u0000rum", world: "bubble" }],
    ["a world that is no key", { q: "quorum", world: "Not A World" }],
    ["a room that is no room", { q: "quorum", world: "bubble", room: "bubble games" }],
    ["a sender that is no address", { q: "quorum", world: "bubble", from: "kai" }],
    ["a cursor that is none", { q: "quorum", world: "bubble", before: "1;DROP" }],
  ])("sends nothing for %s", async (_name, query) => {
    const { api, sent } = server({ status: 200, json: PAGE });
    expect(await api.search(query as Parameters<typeof api.search>[0])).toEqual({ ok: false, reason: "refused" });
    expect(sent).toEqual([]);
  });

  it("says too many when the server's limit answers, and malformed for a body that is no page", async () => {
    expect((await server({ status: 429 }).api.search(ask)).ok).toBe(false);
    expect(await server({ status: 429 }).api.search(ask)).toMatchObject({ reason: "too_many" });
    expect(await server({ status: 200, json: { hits: "x" } }).api.search(ask)).toEqual({
      ok: false,
      reason: "malformed",
    });
  });

  // A hostile or broken answer is refused whole: nothing of it reaches a screen.
  it.each([
    ["a mark past the text's end", { ...HIT, marks: [[4, 17]] }],
    ["a mark of no width", { ...HIT, marks: [[4, 4]] }],
    ["a mark turned round", { ...HIT, marks: [[10, 4]] }],
    [
      "marks out of order",
      {
        ...HIT,
        marks: [
          [10, 12],
          [4, 9],
        ],
      },
    ],
    [
      "marks that overlap",
      {
        ...HIT,
        marks: [
          [4, 9],
          [8, 12],
        ],
      },
    ],
    ["a field that was not promised", { ...HIT, html: "<b>x</b>" }],
    ["a text past 240 characters", { ...HIT, text: "x".repeat(241), marks: [] }],
  ])("refuses an answer with %s", async (_name, hit) => {
    const { api } = server({ status: 200, json: { ...PAGE, hits: [hit] } });
    expect(await api.search(ask)).toEqual({ ok: false, reason: "malformed" });
  });

  it("refuses a page that holds more than 20 hits, or a total past 1,000", async () => {
    const many = { ...PAGE, hits: Array.from({ length: 21 }, () => HIT) };
    expect(await server({ status: 200, json: many }).api.search(ask)).toEqual({ ok: false, reason: "malformed" });
    expect(await server({ status: 200, json: { ...PAGE, total: 1001 } }).api.search(ask)).toEqual({
      ok: false,
      reason: "malformed",
    });
  });

  it("refuses a page that does not say whether it is partial, and takes one that says so", async () => {
    const bare = Object.fromEntries(Object.entries(PAGE).filter(([key]) => key !== "partial"));
    expect(await server({ status: 200, json: bare }).api.search(ask)).toEqual({ ok: false, reason: "malformed" });
    expect((await server({ status: 200, json: { ...PAGE, partial: true } }).api.search(ask)).ok).toBe(true);
  });

  it("takes marks that touch each other, and a page with no mark", async () => {
    const touching = {
      ...HIT,
      marks: [
        [0, 3],
        [3, 4],
      ],
    };
    expect((await server({ status: 200, json: { ...PAGE, hits: [touching] } }).api.search(ask)).ok).toBe(true);
    expect((await server({ status: 200, json: { ...PAGE, hits: [{ ...HIT, marks: [] }] } }).api.search(ask)).ok).toBe(
      true,
    );
  });

  it("is aborted by the signal it is given: the call ends as a network's, the signal passed to the fetch", async () => {
    const seen: AbortSignal[] = [];
    const fetcher: Fetcher = (_url, init) =>
      new Promise((_resolve, reject) => {
        const signal = init?.signal;
        if (signal === undefined || signal === null) return;
        seen.push(signal);
        signal.addEventListener("abort", () => {
          reject(new DOMException("aborted", "AbortError"));
        });
      });
    const controller = new AbortController();
    const pending = searchApi(fetcher).search(ask, controller.signal);
    controller.abort();
    expect(await pending).toEqual({ ok: false, reason: "network" });
    expect(seen[0]?.aborted).toBe(true);
  });
});

describe("marks that sit inside the text they mark", () => {
  it.each([
    ["none", "abc", [], true],
    ["one inside", "abcdef", [[1, 3]], true],
    ["the whole text", "abc", [[0, 3]], true],
    [
      "two apart, in order",
      "abcdef",
      [
        [0, 1],
        [2, 4],
      ],
      true,
    ],
    ["a mark past the end", "abc", [[1, 4]], false],
    ["a negative start", "abc", [[-1, 2]], false],
    ["no width", "abc", [[1, 1]], false],
    [
      "out of order",
      "abcdef",
      [
        [3, 5],
        [0, 1],
      ],
      false,
    ],
    [
      "overlapping",
      "abcdef",
      [
        [0, 3],
        [2, 4],
      ],
      false,
    ],
    ["a half number", "abc", [[0.5, 2]], false],
  ] as const)("%s", (...row) => {
    const [, text, marks, sound] = row;
    expect(marksSound(text, marks)).toBe(sound);
  });
});

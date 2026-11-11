import { ASK_WAIT_S } from "@gnoworld/schemas";
import { describe, expect, it, vi } from "vitest";
import type { Fetcher } from "./http.ts";
import { HOST_AT_ONCE, pageFetch } from "../query/policy.ts";
import { jarvisApi, pageJarvisApi } from "./jarvis.ts";
import { jarvisState } from "./jarvisState.ts";

// 10u-a: the browser's client of the door's /api/jarvis/state and /api/jarvis/ask (the question's route, server/src/door/ask.ts).
const ROOM = "#bubble";
const ANSWERED = {
  status: "answered",
  markdown: "Hello",
  buttons: [{ type: "fly", label: "Bubble", place: "/w/bubble" }],
};
// The JSON a call sent.
const bodyOf = (init: RequestInit | undefined): unknown =>
  JSON.parse(typeof init?.body === "string" ? init.body : "null");
const fly = (place: string) => ({
  status: "answered",
  markdown: "x",
  buttons: [{ type: "fly", label: "Go", place }],
});
const server = (status: number, value?: unknown, over?: () => Promise<Response>) => {
  const sent: { url: string; init: RequestInit }[] = [];
  const fetcher: Fetcher = (url, init = {}) => {
    sent.push({ url, init });
    // A fetch that never answers still ends when its signal aborts, as the platform's does.
    if (over !== undefined)
      return Promise.race([
        over(),
        new Promise<Response>((_, reject) => {
          init.signal?.addEventListener("abort", () => {
            reject(new DOMException("aborted", "AbortError"));
          });
        }),
      ]);
    return Promise.resolve(new Response(value === undefined ? null : JSON.stringify(value), { status }));
  };
  return { sent, api: (ms?: number) => jarvisApi(fetcher, ms), state: (ms?: number) => jarvisState(fetcher, ms) };
};

describe("whether Jarvis is on, from the server", () => {
  it("asks GET /api/jarvis/state, the cookie to this site alone, no redirect, no body", async () => {
    const { sent, state } = server(200, { on: true });
    expect(await state()()).toEqual({ ok: true, value: { on: true } });
    expect(sent[0]?.url).toBe("/api/jarvis/state");
    expect(sent[0]?.init).toMatchObject({ method: "GET", credentials: "same-origin", redirect: "error" });
    expect(sent[0]?.init.body).toBeUndefined();
  });

  it.each([
    ["a body off the schema", 200, { on: "yes" }],
    ["an extra field", 200, { on: true, more: 1 }],
    ["no body", 200, undefined],
  ])("is an error, not a state, for %s", async (_, status, value) => {
    expect(await server(status, value).state()()).toMatchObject({ ok: false });
  });

  it("is an error for a 500, and does not ask again", async () => {
    const { sent, state } = server(500, { error: "internal" });
    expect(await state()()).toMatchObject({ ok: false });
    expect(sent).toHaveLength(1);
  });
});

describe("a question to Jarvis, through the door", () => {
  it("POSTs the question as JSON to /api/jarvis/ask, and reads an answered answer", async () => {
    const { sent, api } = server(200, ANSWERED);
    expect(await api().ask({ question: "What is this?", room: ROOM })).toEqual({ ok: true, value: ANSWERED });
    expect(sent[0]?.url).toBe("/api/jarvis/ask");
    expect(sent[0]?.init).toMatchObject({ method: "POST", credentials: "same-origin", redirect: "error" });
    expect(bodyOf(sent[0]?.init)).toEqual({ question: "What is this?", room: ROOM });
  });

  it("sends a fixed ask with no words: its ask and its room, no question key", async () => {
    const { sent, api } = server(200, { status: "paused" });
    await api().ask({ ask: "here", room: ROOM });
    await api().ask({ ask: "catch-up", room: ROOM });
    expect(sent.map(({ init }) => bodyOf(init))).toEqual([
      { ask: "here", room: ROOM },
      { ask: "catch-up", room: ROOM },
    ]);
  });

  it.each(["declined", "paused", "capped", "early", "busy", "spent", "off"])(
    "reads the guard's answer %s",
    async (status) => {
      expect(await server(200, { status }).api().ask({ ask: "here", room: ROOM })).toEqual({
        ok: true,
        value: { status },
      });
    },
  );

  it.each([
    ["a status it does not know", 200, { status: "maybe" }],
    ["an answer with an extra field", 200, { status: "off", why: "x" }],
    [
      "an answer with coins in a button's action",
      200,
      {
        status: "answered",
        markdown: "x",
        buttons: [
          {
            type: "action",
            label: "Go",
            action: { realm: "gno.land/r/a", function: "F", args: {}, why: "w", coins: "5ugnot" },
          },
        ],
      },
    ],
    [
      "six buttons",
      200,
      {
        status: "answered",
        markdown: "x",
        buttons: Array.from({ length: 6 }, () => ({ type: "fly", label: "a", place: "/" })),
      },
    ],
    ["an empty answer", 200, { status: "answered", markdown: "", buttons: [] }],
    ["a fly place that is another site", 200, fly("https://evil.example")],
    ["a fly place that is protocol-relative", 200, fly("//evil.example")],
    ["a fly place that is a script", 200, fly("javascript:alert(1)")],
    ["a fly place in capitals", 200, fly("/W/Bubble")],
    ["a fly place with an empty step", 200, fly("/a//b")],
    ["a fly place of 201 characters", 200, fly(`/${"a".repeat(200)}`)],
    [
      "a button of an unknown type",
      200,
      { status: "answered", markdown: "x", buttons: [{ type: "open", label: "a", place: "/" }] },
    ],
    [
      "an action with no why",
      200,
      {
        status: "answered",
        markdown: "x",
        buttons: [{ type: "action", label: "Go", action: { realm: "gno.land/r/a", function: "F", args: {} } }],
      },
    ],
    ["an answer of 8001 code points", 200, { status: "answered", markdown: "a".repeat(8001), buttons: [] }],
    ["no body", 200, undefined],
  ])("is an error for %s", async (_, status, value) => {
    expect(await server(status, value).api().ask({ ask: "here", room: ROOM })).toMatchObject({ ok: false });
  });

  it.each([
    [401, { error: "unauthenticated" }],
    [403, { error: "forbidden" }],
    [429, { error: "too_many" }],
    [500, { error: "internal" }],
    [503, { error: "not_ready" }],
    [504, { error: "not_ready" }],
  ])("is an error for a %i, asked once and never again", async (status, value) => {
    const { sent, api } = server(status, value);
    expect(await api().ask({ ask: "here", room: ROOM })).toMatchObject({ ok: false });
    expect(sent).toHaveLength(1);
  });

  it("is an error when the network fails or the time runs out, never a hang", async () => {
    const down = server(0, undefined, () => Promise.reject(new TypeError("offline")));
    expect(await down.api().ask({ ask: "here", room: ROOM })).toMatchObject({ ok: false, reason: "network" });
    const slow = server(0, undefined, () => new Promise<Response>(() => undefined));
    expect(await slow.api(20).ask({ ask: "here", room: ROOM })).toMatchObject({ ok: false });
    expect(slow.sent).toHaveLength(1);
  });

  it("refuses a question that is off the schema before sending it: empty, or a room that is no room", async () => {
    const { sent, api } = server(200, ANSWERED);
    expect(await api().ask({ question: "", room: ROOM })).toMatchObject({ ok: false });
    expect(await api().ask({ question: "hi", room: "bubble" })).toMatchObject({ ok: false });
    expect(sent).toHaveLength(0);
  });

  it("sends 500 code points, astral ones counted as one each, and refuses 501 before sending (D13986)", async () => {
    const { sent, api } = server(200, ANSWERED);
    expect(await api().ask({ question: "\u{1F600}".repeat(500), room: ROOM })).toMatchObject({ ok: true });
    expect(await api().ask({ question: "a".repeat(501), room: ROOM })).toMatchObject({ ok: false });
    expect(sent).toHaveLength(1);
  });

  it("takes 5 buttons and 8000 code points, the door's own bounds", async () => {
    const full = {
      status: "answered",
      markdown: "a".repeat(8000),
      buttons: Array.from({ length: 5 }, () => ({ type: "fly", label: "a", place: "/w/bubble" })),
    };
    expect(await server(200, full).api().ask({ ask: "here", room: ROOM })).toEqual({ ok: true, value: full });
  });

  it("sends the explain ask as it is, and refuses a malformed realm before sending", async () => {
    const { sent, api } = server(200, { status: "paused" });
    const ask = { ask: "function", room: ROOM, realm: "gno.land/r/gov/dao", function: "Vote" } as const;
    await api().ask(ask);
    expect(bodyOf(sent[0]?.init)).toEqual(ask);
    expect(await api().ask({ ...ask, realm: "gno.land/r/x\ny" })).toMatchObject({ ok: false });
    expect(sent).toHaveLength(1);
  });

  it("gives up on a state that never answers, asked once", async () => {
    const slow = server(0, undefined, () => new Promise<Response>(() => undefined));
    expect(await slow.state(20)()).toMatchObject({ ok: false });
    expect(slow.sent).toHaveLength(1);
  });

  it("waits for an answer as long as the door does and 10 s more, a state only 10 s: a slow answer is not lost to the page's clock", async () => {
    vi.useFakeTimers();
    try {
      const slow = server(0, undefined, () => new Promise<Response>(() => undefined));
      const answer = slow.api().ask({ ask: "here", room: ROOM });
      const state = slow.state()();
      await vi.advanceTimersByTimeAsync(10_001);
      expect(await state).toMatchObject({ ok: false });
      let done = false;
      const ended = answer.then((result) => {
        done = true;
        return result;
      });
      await vi.advanceTimersByTimeAsync(ASK_WAIT_S.door * 1000 - 10_001);
      expect(done).toBe(false);
      await vi.advanceTimersByTimeAsync(11_000);
      expect(await ended).toMatchObject({ ok: false });
    } finally {
      vi.useRealTimers();
    }
  });

  it("asks on a fetch of its own, so ask after ask in flight never holds the page's own-origin reads behind the gate", async () => {
    const reads: string[] = [];
    vi.stubGlobal(
      "fetch",
      vi.fn((url: string) => {
        if (url.startsWith("/api/jarvis/ask")) return new Promise<Response>(() => undefined);
        reads.push(url);
        return Promise.resolve(new Response("{}", { status: 200 }));
      }),
    );
    try {
      const pending = Array.from({ length: HOST_AT_ONCE + 1 }, () => pageJarvisApi().ask({ ask: "here", room: ROOM }));
      expect(pending).toHaveLength(HOST_AT_ONCE + 1);
      const read = await Promise.race([
        pageFetch("/markets.json").then(() => "read"),
        new Promise<string>((resolve) => setTimeout(resolve, 200, "blocked")),
      ]);
      expect(read).toBe("read");
      expect(reads).toEqual(["/markets.json"]);
    } finally {
      vi.unstubAllGlobals();
    }
  });
});

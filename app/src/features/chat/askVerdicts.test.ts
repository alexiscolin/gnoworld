import type { Line } from "@gnoworld/core";
import type { LineVerdicts, StreamEvent } from "@gnoworld/schemas";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { Result } from "../../lib/api/http.ts";
import { BUSY_REST_MS, REST_MS, verdictAsker } from "./askVerdicts.ts";

// When the page began following the room's stream; a line before it is the room's history.
const OPENED = Date.parse("2026-10-26T12:00:00.000Z");
const OLD = "2026-10-26T11:00:00.000Z";
const line = (id: string, time = OLD): Line => ({
  id,
  time,
  from: "a",
  text: `${id}: https://youtu.be/dQw4w9WgXcQ`,
  kind: "message",
});
const NONE: Result<LineVerdicts> = { ok: true, value: { room: "#bubble", verdicts: [] } };

// A server that answers each request as told, keeping the ids each asked; and the verdicts handed to the store.
function server(answer: (ids: readonly string[]) => Promise<Result<LineVerdicts>> = () => Promise.resolve(NONE)) {
  const sent: string[][] = [];
  const heard: StreamEvent[] = [];
  let holding: Record<string, unknown> | undefined;
  const asker = verdictAsker({
    verdicts: (_room, ids) => {
      sent.push([...ids]);
      return answer(ids);
    },
    judged: (event) => {
      heard.push(event);
    },
    held: () => holding,
    // The stream says it began following when the page did.
    follow: (_room, on) => {
      on.since(OPENED);
      return () => undefined;
    },
  });
  const ask = (lines: readonly Line[], held?: Record<string, unknown>) => {
    holding = held;
    asker.show("#bubble", lines);
  };
  return { ask, sent, heard, stop: asker.stop };
}
// The answers' turn: each request's promise settled, and what it does after.
const settled = () => new Promise((resolve) => setTimeout(resolve, 0));
const refusal = (reason: "refused" | "forbidden" | "malformed"): Promise<Result<LineVerdicts>> =>
  Promise.resolve({ ok: false, reason });

describe("verdictAsker: the server's verdicts of the lines in view", () => {
  // F884: a line from the stream's opening on has its verdict from the stream; asking the server too made every
  // reader ask for every new link at once.
  it("asks the lines older than the stream's opening alone", () => {
    const t = server();
    t.ask([line("a"), line("b", "2026-10-26T12:00:00.000Z"), line("c", "2026-10-26T12:05:00.000Z")]);
    expect(t.sent).toEqual([["a"]]);
  });

  // F884: what it asked is kept for the lines in view alone, so a long session holds no more.
  it("forgets a line that left the view, and asks it again when it comes back", () => {
    const t = server();
    t.ask([line("a"), line("b")]);
    t.ask([line("b")]);
    t.ask([line("a"), line("b")]);
    expect(t.sent).toEqual([["a", "b"], ["a"]]);
  });

  it("asks VERDICTS_ASKED lines a request at most, in their order", () => {
    const t = server();
    const ids = Array.from({ length: 250 }, (_, n) => `m${String(n)}`);
    t.ask(ids.map((id) => line(id)));
    expect(t.sent.map((asked) => asked.length)).toEqual([100, 100, 50]);
    expect(t.sent.flat()).toEqual(ids);
  });

  it("asks a line once while it stays in view, whatever comes after", async () => {
    const t = server();
    t.ask([line("a")]);
    await settled();
    t.ask([line("a"), line("b")]);
    t.ask([line("a"), line("b")]);
    expect(t.sent).toEqual([["a"], ["b"]]);
  });

  it("asks nothing of a line whose verdict the page holds, or that has no player", () => {
    const t = server();
    t.ask([line("a"), { ...line("b"), text: "no link here" }, line("c")], { a: "checked" });
    expect(t.sent).toEqual([["c"]]);
  });

  it("hands each verdict the server gives to the store, with the room it was asked of", async () => {
    const t = server(() =>
      Promise.resolve({
        ok: true,
        value: {
          room: "#bubble",
          verdicts: [
            { msgid: "a", state: "hidden" },
            { msgid: "b", state: "checked" },
          ],
        },
      }),
    );
    t.ask([line("a"), line("b")]);
    await settled();
    expect(t.heard).toEqual([
      { msgid: "a", room: "#bubble", state: "hidden" },
      { msgid: "b", room: "#bubble", state: "checked" },
    ]);
  });

  // The server would answer the same again: a request it refuses, a room the reader may not read, an answer not
  // its own.
  it.each(["refused", "forbidden", "malformed"] as const)("never asks again a line the server %s", async (reason) => {
    const t = server(() => refusal(reason));
    t.ask([line("a")]);
    await settled();
    t.ask([line("a"), line("b")]);
    expect(t.sent).toEqual([["a"], ["b"]]);
    expect(t.heard).toEqual([]);
  });
});

// F890: the page dated the stream's opening by its own clock, against Ergo's server-time: ahead, it asked the server
// of every line said in the gap, one request each; behind, it left lines to nobody. The stream says when it began.
const LINES = [line("a"), line("b", "2026-10-26T12:00:00.000Z"), line("c", "2026-10-26T12:05:00.000Z")];
// An asker whose stream says when it began only when told to; the page's clock as given.
function told(clock = OPENED) {
  const sent: string[][] = [];
  let said: ((time: number) => void) | undefined;
  let ended: (() => void) | undefined;
  let follows = 0;
  // Not a literal, so a part the asker no longer takes (its clock) is still handed, as the page's was.
  const parts = {
    verdicts: (_room: string, ids: readonly string[]) => {
      sent.push([...ids]);
      return Promise.resolve(NONE);
    },
    judged: () => undefined,
    held: () => undefined,
    follow: (_room: string, on: { since: (time: number) => void; dead: () => void }) => {
      follows += 1;
      said = on.since;
      ended = on.dead;
      return () => undefined;
    },
    now: () => clock,
  };
  const asker = verdictAsker(parts);
  const say = (time: number) => {
    said?.(time);
  };
  const end = () => {
    ended?.();
  };
  return { asker, sent, say, end, follows: () => follows };
}
const HOUR = 3_600_000;

describe("verdictAsker: when the stream began, by the stream's word", () => {
  it("asks nothing before the stream says when it began, then the lines said before", () => {
    const t = told();
    t.asker.show("#bubble", LINES);
    expect(t.sent).toEqual([]);
    t.say(OPENED);
    expect(t.sent).toEqual([["a"]]);
  });

  it.each([
    ["an hour ahead", HOUR],
    ["an hour behind", -HOUR],
  ])("asks the same with the page's clock %s", (_, skew) => {
    vi.useFakeTimers({ now: OPENED + skew });
    try {
      const t = told(OPENED + skew);
      t.asker.show("#bubble", LINES);
      t.say(OPENED);
      expect(t.sent).toEqual([["a"]]);
    } finally {
      vi.useRealTimers();
    }
  });

  // A reconnection's word comes later: the replay gave what was missed, and the lines before the word it did not
  // give are the server's.
  it("takes a later word, a reconnection's, and asks of the lines said before it", () => {
    const t = told();
    t.asker.show("#bubble", LINES.slice(1));
    t.say(OPENED);
    t.say(Date.parse("2026-10-26T12:10:00.000Z"));
    expect(t.sent).toEqual([["b", "c"]]);
  });

  it("takes no word of a room it no longer follows", () => {
    const t = told();
    t.asker.show("#bubble", LINES);
    t.asker.show("#news", undefined);
    t.say(OPENED);
    expect(t.sent).toEqual([]);
  });
});

// F888: the stream given up (a 429 for a fifth tab, a restart's 502), a line said since waited for good, asked of no
// one; now every line in view is the server's, and the stream is followed again after the route's minute.
describe("verdictAsker, when the stream ends for good", () => {
  const LINES = [line("a"), line("c", "2026-10-26T12:05:00.000Z")];
  afterEach(() => {
    vi.useRealTimers();
  });

  it("asks of every line in view once the stream ends, a line said after its word too", () => {
    const t = told();
    t.asker.show("#bubble", LINES);
    t.say(OPENED);
    t.end();
    expect(t.sent).toEqual([["a"], ["c"]]);
  });

  it("asks of every line in view though the stream ended before its word", () => {
    const t = told();
    t.asker.show("#bubble", LINES);
    t.end();
    expect(t.sent).toEqual([["a", "c"]]);
  });

  it("follows the room's stream again after the route's minute, and takes its new word", () => {
    vi.useFakeTimers();
    const t = told();
    t.asker.show("#bubble", LINES);
    t.end();
    vi.advanceTimersByTime(BUSY_REST_MS - 1);
    expect(t.follows()).toBe(1);
    vi.advanceTimersByTime(1);
    expect(t.follows()).toBe(2);
  });

  it.each([
    [
      "stopped",
      (t: ReturnType<typeof told>) => {
        t.asker.stop();
      },
    ],
    [
      "showing another room",
      (t: ReturnType<typeof told>) => {
        t.asker.show("#news", undefined);
      },
    ],
  ])("follows no ended stream again once %s", (_, leave) => {
    vi.useFakeTimers();
    const t = told();
    t.asker.show("#bubble", LINES);
    t.end();
    leave(t);
    const before = t.follows();
    vi.advanceTimersByTime(BUSY_REST_MS * 2);
    expect(t.follows()).toBe(before);
  });
});

// F874: a failure that may pass left its lines waiting forever (a server's 500, a 429), or asked them again at each
// new line (the network); now they are asked again once, after a rest, and nothing is asked during it.
describe("verdictAsker, when the server cannot answer yet", () => {
  beforeEach(() => {
    vi.useFakeTimers();
  });
  afterEach(() => {
    vi.useRealTimers();
  });
  const failing = (reason: "too_many" | "internal" | "unavailable" | "network"): Promise<Result<LineVerdicts>> =>
    Promise.resolve({ ok: false, reason });

  it("asks nothing for the route's minute after too many, then the view last given, once", async () => {
    const t = server(() => failing("too_many"));
    t.ask([line("a")]);
    await vi.advanceTimersByTimeAsync(0);
    t.ask([line("a"), line("b")]);
    await vi.advanceTimersByTimeAsync(BUSY_REST_MS - 1);
    expect(t.sent).toEqual([["a"]]);
    await vi.advanceTimersByTimeAsync(1);
    expect(t.sent).toEqual([["a"], ["a", "b"]]);
    await vi.advanceTimersByTimeAsync(BUSY_REST_MS);
    expect(t.sent).toHaveLength(3);
  });

  it("rests once though its requests fail at different times: nothing is asked in the rest that follows", async () => {
    let calls = 0;
    const t = server(() => {
      calls += 1;
      // The first view's second request fails half a rest after its first.
      if (calls !== 2) return failing("too_many");
      return new Promise((resolve) => {
        setTimeout(() => {
          resolve({ ok: false, reason: "too_many" });
        }, BUSY_REST_MS / 2);
      });
    });
    t.ask(Array.from({ length: 150 }, (_, n) => line(`m${String(n)}`)));
    await vi.advanceTimersByTimeAsync(BUSY_REST_MS);
    expect(t.sent).toHaveLength(4);
    await vi.advanceTimersByTimeAsync(BUSY_REST_MS - 1);
    expect(t.sent).toHaveLength(4);
  });

  it.each(["internal", "unavailable", "network"] as const)(
    "asks a line again after a short rest when the server answers %s, not at once",
    async (reason) => {
      const t = server(() => failing(reason));
      t.ask([line("a")]);
      await vi.advanceTimersByTimeAsync(0);
      t.ask([line("a")]);
      await vi.advanceTimersByTimeAsync(REST_MS - 1);
      expect(t.sent).toEqual([["a"]]);
      await vi.advanceTimersByTimeAsync(1);
      expect(t.sent).toEqual([["a"], ["a"]]);
    },
  );

  it("takes a request that throws as the network's failure", async () => {
    const t = server(() => Promise.reject(new Error("gone")));
    t.ask([line("a")]);
    await vi.advanceTimersByTimeAsync(REST_MS);
    expect(t.sent).toEqual([["a"], ["a"]]);
  });

  it.each([
    ["its answer still to come", false],
    ["a rest under way", true],
  ])("asks nothing more once stopped, %s", async (_, answered) => {
    const t = server(() => failing("network"));
    t.ask([line("a")]);
    if (answered) await vi.advanceTimersByTimeAsync(0);
    t.stop();
    await vi.advanceTimersByTimeAsync(BUSY_REST_MS * 2);
    expect(t.sent).toEqual([["a"]]);
  });
});

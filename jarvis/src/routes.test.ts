import {
  ApiError,
  JARVIS_PATHS,
  JarvisAnswer,
  JarvisBudgets,
  type AnswerButton,
  type JarvisAsk,
} from "@gnoworld/schemas";
import { afterEach, describe, expect, it, vi } from "vitest";
import { serve } from "./http.ts";
import type { Question, Result } from "./loop.ts";
import { jarvisRoutes } from "./routes.ts";
import { budgetFor, capture } from "./testing/kit.ts";

const DOLLAR = 1_000_000_000;
const ROOM = "#bubble";
const opened: { close: () => Promise<void> }[] = [];
afterEach(async () => {
  await Promise.all(opened.splice(0).map((served) => served.close()));
});

type Ask = (question: Question, signal: AbortSignal) => Promise<Result>;
const asking = (result: Result) => vi.fn<Ask>(() => Promise.resolve(result));

// jarvis's routes on a port of their own, with the loop's ask the test gives (none: switched off) and a budget whose
// caps start at $45 and $5.
const served = async ({ ask }: { ask?: Ask | undefined } = {}) => {
  const { log, events, raw } = capture();
  const budget = budgetFor(45 * DOLLAR);
  budget.budget.change("translate", 5 * DOLLAR);
  const jarvis = await serve(jarvisRoutes({ ask, budget: budget.budget, log }), {
    host: "127.0.0.1",
    port: 0,
    names: ["127.0.0.1"],
    log,
    ready: () => true,
  });
  const address = jarvis.server.address();
  if (address === null || typeof address === "string") throw new Error("no port");
  const url = `http://127.0.0.1:${String(address.port)}`;
  opened.push({
    close: () =>
      new Promise((resolve) => {
        jarvis.server.closeAllConnections();
        jarvis.server.close(() => {
          budget.close();
          resolve();
        });
      }),
  });
  const post = (path: string, body: unknown) =>
    fetch(`${url}${path}`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify(body),
    });
  return { url, post, events, raw, budget: budget.budget };
};
const question = (over: Partial<JarvisAsk> = {}): JarvisAsk => ({
  question: "Where is GovDAO?",
  room: ROOM,
  lines: [],
  ...over,
});
const cards = (buttons: AnswerButton[] = []) => ({
  digests: [],
  proposals: [],
  buttons: buttons.map((button) => ({ button })),
});
const fly: AnswerButton = { type: "fly", label: "Fly to GovDAO", place: "/w/govdao" };

describe("POST /ask: a question to the loop", () => {
  it("answers off while jarvis is switched off, before any work", async () => {
    const { post } = await served();
    const response = await post(JARVIS_PATHS.ask, question());
    expect(response.status).toBe(200);
    expect(JarvisAnswer.parse(await response.json())).toEqual({ status: "off" });
  });

  it("refuses a question its schema refuses, off as on, before any work, logging the refusal by its route", async () => {
    for (const ask of [undefined, asking({ kind: "spent" })]) {
      const { post, events } = await served({ ask });
      const response = await post(JARVIS_PATHS.ask, { ...question(), account: "g1..." });
      expect([response.status, ApiError.parse(await response.json())]).toEqual([400, { error: "refused" }]);
      expect(ask?.mock.calls ?? []).toEqual([]);
      expect(events()).toEqual([
        { event: "jarvis_refused", route: JARVIS_PATHS.ask, method: "POST", status: 400, error: "refused" },
      ]);
    }
  });

  it("hands the loop the question's words, the room's lines as data with who said them, and the request's signal", async () => {
    const ask = asking({ kind: "spent" });
    const { post } = await served({ ask });
    const lines = [
      { speaker: 1, text: "is the chain up?", time: "2026-11-04T12:00:00.000Z" },
      { speaker: 0, text: 'it said "no"\nthen yes' },
    ];
    await post(JARVIS_PATHS.ask, question({ lines }));
    expect(ask).toHaveBeenCalledOnce();
    const [handed, signal] = ask.mock.calls[0] ?? [];
    expect(handed).toEqual({
      text: "Where is GovDAO?",
      room: [
        JSON.stringify({ who: "#1", time: "2026-11-04T12:00:00.000Z", text: "is the chain up?" }),
        JSON.stringify({ who: "asker", text: 'it said "no"\nthen yes' }),
      ],
    });
    expect(signal).toBeInstanceOf(AbortSignal);
  });

  it("answers the loop's answer with its text and the buttons its tools kept, as the door's schema reads it", async () => {
    const kept = { digests: [], proposals: [], buttons: [{ button: fly, read: { profile: "onyx", height: 7 } }] };
    const { post } = await served({ ask: asking({ kind: "answer", text: "GovDAO is on Onyx.", cards: kept }) });
    const response = await post(JARVIS_PATHS.ask, question());
    expect(response.status).toBe(200);
    expect(JarvisAnswer.parse(await response.json())).toEqual({
      status: "answered",
      markdown: "GovDAO is on Onyx.",
      buttons: [fly],
    });
  });

  it("sends no digest and no proposal an answer holds, which the wire has no place for", async () => {
    const digest = { realm: "gno.land/r/gov/dao", read: { profile: "onyx", height: 7 }, digest: { blocks: [] } };
    const proposal = {
      read: { profile: "onyx", height: 7 },
      action: { realm: "gno.land/r/gov/dao", function: "Vote", args: {}, why: "to vote" },
    };
    const held = { digests: [digest], proposals: [proposal], buttons: [] };
    const { post } = await served({ ask: asking({ kind: "answer", text: "Here.", cards: held }) });
    expect(await (await post(JARVIS_PATHS.ask, question())).json()).toEqual({
      status: "answered",
      markdown: "Here.",
      buttons: [],
    });
  });

  it("cuts an answer past the wire's 8,000 code points on its last line break within them", async () => {
    const astral = String.fromCodePoint(0x1f600);
    const head = `${astral.repeat(5_000)}\n${"b".repeat(2_000)}\n`;
    const text = `${head}${"c".repeat(3_000)}`;
    const { post, events } = await served({ ask: asking({ kind: "answer", text, cards: cards() }) });
    const answer = JarvisAnswer.parse(await (await post(JARVIS_PATHS.ask, question())).json());
    expect(answer).toEqual({ status: "answered", markdown: head, buttons: [] });
    expect(events()).toContainEqual({ event: "jarvis_answer_cut" });
  });

  it("cuts an answer with no line break at 8,000 code points, never inside a character", async () => {
    const astral = String.fromCodePoint(0x1f600);
    const { post } = await served({ ask: asking({ kind: "answer", text: astral.repeat(9_000), cards: cards() }) });
    const answer = JarvisAnswer.parse(await (await post(JARVIS_PATHS.ask, question())).json());
    expect(answer.status === "answered" && answer.markdown).toBe(astral.repeat(8_000));
  });

  it("answers an answer of exactly 8,000 code points whole", async () => {
    const text = "a".repeat(7_999) + String.fromCodePoint(0x1f600);
    const { post, events } = await served({ ask: asking({ kind: "answer", text, cards: cards() }) });
    expect(await (await post(JARVIS_PATHS.ask, question())).json()).toMatchObject({ markdown: text });
    expect(events().filter(({ event }) => event === "jarvis_answer_cut")).toEqual([]);
  });

  it.each<[string, () => string, () => string]>([
    [
      "a line break at its 8,000th code point, kept",
      () => `${"a".repeat(7_999)}\n${"b".repeat(100)}`,
      () => `${"a".repeat(7_999)}\n`,
    ],
    [
      "a line break at its 8,001st, past the cut",
      () => `${"a".repeat(8_000)}\n${"b".repeat(100)}`,
      () => "a".repeat(8_000),
    ],
    [
      "only a first line break, which would leave nothing",
      () => `\n${"x".repeat(9_000)}`,
      () => `\n${"x".repeat(7_999)}`,
    ],
    ["a blank first line, cut at the bound", () => ` \n${"x".repeat(9_000)}`, () => ` \n${"x".repeat(7_998)}`],
  ])("cuts an answer with %s", async (_case, text, markdown) => {
    const { post } = await served({ ask: asking({ kind: "answer", text: text(), cards: cards() }) });
    const answer = JarvisAnswer.parse(await (await post(JARVIS_PATHS.ask, question())).json());
    expect(answer).toEqual({ status: "answered", markdown: markdown(), buttons: [] });
  });

  it.each([
    ["empty", () => ""],
    ["of spaces and line breaks", () => "  \n\t\n "],
    ["of characters that draw nothing", () => String.fromCodePoint(0x200b, 0x2060, 0x3164)],
  ])("answers an answer %s, which the wire holds no place for, as internal", async (_case, text) => {
    const { post, events } = await served({ ask: asking({ kind: "answer", text: text(), cards: cards([fly]) }) });
    const response = await post(JARVIS_PATHS.ask, question());
    expect([response.status, ApiError.parse(await response.json())]).toEqual([502, { error: "internal" }]);
    expect(events()).toContainEqual({ event: "jarvis_answer_empty" });
  });

  it("answers spent at 100% of the day's budget, as the door's schema reads it", async () => {
    const { post } = await served({ ask: asking({ kind: "spent" }) });
    const response = await post(JARVIS_PATHS.ask, question());
    expect(response.status).toBe(200);
    expect(JarvisAnswer.parse(await response.json())).toEqual({ status: "spent" });
  });

  it("refuses a question the loop finds blank or too long as refused", async () => {
    const { post } = await served({ ask: asking({ kind: "invalid" }) });
    const response = await post(JARVIS_PATHS.ask, question());
    expect([response.status, ApiError.parse(await response.json())]).toEqual([400, { error: "refused" }]);
  });

  it.each<[string, Result]>([
    ["the turn cap", { kind: "turns" }],
    ["max_tokens", { kind: "max_tokens" }],
    ["a refusal", { kind: "refusal", category: "cyber" }],
    ["a model error", { kind: "failed", reason: "error" }],
    ["a model timeout", { kind: "failed", reason: "timeout" }],
    ["a stop it never asks for", { kind: "failed", reason: "stop" }],
  ])("answers a question that ended at %s, with no answer, as internal", async (_case, result) => {
    const { post } = await served({ ask: asking(result) });
    const response = await post(JARVIS_PATHS.ask, question());
    expect([response.status, ApiError.parse(await response.json())]).toEqual([502, { error: "internal" }]);
  });

  it("answers a question whose asker left as not_ready, to nobody", async () => {
    const { post } = await served({ ask: asking({ kind: "gone" }) });
    const response = await post(JARVIS_PATHS.ask, question());
    expect([response.status, ApiError.parse(await response.json())]).toEqual([503, { error: "not_ready" }]);
  });

  it.each([
    ["a field the wire does not name", () => ({ ...question(), account: "g1x" })],
    ["no question", () => ({ room: ROOM, lines: [] })],
    ["an empty question", () => question({ question: "" })],
    ["a question past 8,000 code points", () => question({ question: "q".repeat(8_001) })],
    ["no room", () => ({ question: "q", lines: [] })],
    ["31 lines", () => question({ lines: Array.from({ length: 31 }, () => ({ speaker: 1, text: "x" })) })],
    ["a speaker past 30", () => question({ lines: [{ speaker: 31, text: "x" }] })],
    ["a negative speaker", () => question({ lines: [{ speaker: -1, text: "x" }] })],
    ["a line's time that is no time", () => question({ lines: [{ speaker: 1, text: "x", time: "noon" }] })],
    ["an empty line", () => question({ lines: [{ speaker: 1, text: "" }] })],
    ["a line past 8,192 code points", () => question({ lines: [{ speaker: 1, text: "l".repeat(8_193) }] })],
    ["a speaker that is no whole number", () => question({ lines: [{ speaker: 1.5, text: "x" }] })],
    ["a list in place of the question", () => [question()]],
    ["null", () => null],
  ])("refuses %s as refused, the loop never asked", async (_case, body) => {
    const ask = asking({ kind: "spent" });
    const { post } = await served({ ask });
    const response = await post(JARVIS_PATHS.ask, body());
    expect([response.status, ApiError.parse(await response.json())]).toEqual([400, { error: "refused" }]);
    expect(ask).not.toHaveBeenCalled();
  });

  it("takes a line of 8,192 code points and the speaker 30, the most", async () => {
    const ask = asking({ kind: "spent" });
    const { post } = await served({ ask });
    const lines = [{ speaker: 30, text: "l".repeat(8_192) }];
    expect((await post(JARVIS_PATHS.ask, question({ lines }))).status).toBe(200);
    expect(ask.mock.calls[0]?.[0].room).toEqual([JSON.stringify({ who: "#30", text: "l".repeat(8_192) })]);
  });

  it("takes a question of 8,000 code points and 30 lines, the most", async () => {
    const ask = asking({ kind: "spent" });
    const { post } = await served({ ask });
    const lines = Array.from({ length: 30 }, (_, at) => ({ speaker: at, text: "l".repeat(270) }));
    expect((await post(JARVIS_PATHS.ask, question({ question: "q".repeat(8_000), lines }))).status).toBe(200);
    expect(ask).toHaveBeenCalledOnce();
  });

  it("logs no question, room line or answer", async () => {
    const lines = [{ speaker: 1, text: "a-room-line-0123456789" }];
    const { post, raw } = await served({
      ask: asking({ kind: "answer", text: "an-answer-0123456789", cards: cards() }),
    });
    await post(JARVIS_PATHS.ask, question({ question: "a-question-0123456789", lines }));
    expect(raw()).not.toMatch(/a-question-|a-room-line-|an-answer-/);
  });
});

describe("GET and POST /budgets: the day's budgets, changed at once", () => {
  it("reads both budgets in whole dollars, as the door's schema reads them", async () => {
    const { url } = await served();
    const response = await fetch(`${url}${JARVIS_PATHS.budgets}`);
    expect(response.status).toBe(200);
    expect(JarvisBudgets.parse(await response.json())).toEqual({ ask: 45, translate: 5 });
  });

  it("changes a budget at once, logs the change, and answers both", async () => {
    const { post, budget, events } = await served({ ask: asking({ kind: "spent" }) });
    const response = await post(JARVIS_PATHS.budgets, { budget: "ask", dollars: 120 });
    expect(response.status).toBe(200);
    expect(JarvisBudgets.parse(await response.json())).toEqual({ ask: 120, translate: 5 });
    expect(budget.caps()).toEqual({ ask: 120 * DOLLAR, translate: 5 * DOLLAR });
    expect(budget.state("ask").cap).toBe(120 * DOLLAR);
    expect(events()).toContainEqual({ event: "jarvis_budget_changed", setting: "ask", value: 120 });
  });

  it("changes the translations' budget alone", async () => {
    const { post, budget } = await served();
    await post(JARVIS_PATHS.budgets, { budget: "translate", dollars: 1 });
    expect(budget.caps()).toEqual({ ask: 45 * DOLLAR, translate: DOLLAR });
  });

  it("serves the budgets while jarvis is off, so an admin sets them before switching it on", async () => {
    const { post } = await served();
    expect((await post(JARVIS_PATHS.budgets, { budget: "ask", dollars: 500 })).status).toBe(200);
  });

  it.each([
    ["0 dollars", { budget: "ask", dollars: 0 }],
    ["501 dollars", { budget: "ask", dollars: 501 }],
    ["a fraction", { budget: "ask", dollars: 4.5 }],
    ["dollars as text", { budget: "ask", dollars: "45" }],
    ["no dollars", { budget: "ask" }],
    ["another budget", { budget: "digest", dollars: 5 }],
    ["a field the wire does not name", { budget: "ask", dollars: 5, by: "admin" }],
  ])("refuses %s as refused, every budget unchanged and no change logged", async (_case, body) => {
    const { post, budget, events } = await served();
    const response = await post(JARVIS_PATHS.budgets, body);
    expect([response.status, ApiError.parse(await response.json())]).toEqual([400, { error: "refused" }]);
    expect(budget.caps()).toEqual({ ask: 45 * DOLLAR, translate: 5 * DOLLAR });
    expect(events()).toEqual([
      { event: "jarvis_refused", route: JARVIS_PATHS.budgets, method: "POST", status: 400, error: "refused" },
    ]);
  });

  it("takes 1 and 500 dollars, the bounds", async () => {
    const { post } = await served();
    expect(await (await post(JARVIS_PATHS.budgets, { budget: "ask", dollars: 1 })).json()).toEqual({
      ask: 1,
      translate: 5,
    });
    expect(await (await post(JARVIS_PATHS.budgets, { budget: "ask", dollars: 500 })).json()).toEqual({
      ask: 500,
      translate: 5,
    });
  });
});

describe("jarvis's routes", () => {
  it("are JARVIS_PATHS alone, each with the methods the door calls", () => {
    const { log } = capture();
    const routes = jarvisRoutes({ ask: undefined, budget: budgetFor(DOLLAR).budget, log });
    expect(Object.keys(routes).sort()).toEqual(Object.values(JARVIS_PATHS).sort());
    expect(Object.keys(routes[JARVIS_PATHS.ask] ?? {})).toEqual(["POST"]);
    expect(Object.keys(routes[JARVIS_PATHS.budgets] ?? {}).sort()).toEqual(["GET", "POST"]);
  });
});

import { readdirSync, readFileSync } from "node:fs";
import {
  type AnswerButton,
  ApiError,
  JARVIS_LANGUAGES,
  JARVIS_PATHS,
  JarvisAnswer,
  JarvisAsk,
  JarvisBudgets,
  JarvisDigest,
  JarvisDigestRequest,
  JarvisMadeDigest,
  JarvisTranslate,
  JarvisTranslation,
} from "@gnoworld/schemas";
import { afterEach, describe, expect, it, vi } from "vitest";
import { serve } from "./http.ts";
import type { Question, Result } from "./loop.ts";
import { jarvisRoutes } from "./routes.ts";
import { budgetFor, capture } from "./testing/kit.ts";
import type { Digested } from "./digest.ts";
import type { Translated } from "./translate.ts";
import { FunctionList } from "@gnoworld/schemas/functions";
import { z } from "zod";
import type * as zm from "zod/mini";
import { gnomcpTools } from "./gnomcpTools.ts";
import { MODELS } from "./prices.ts";
import { gnoscopeTools } from "./tools/gnoscopeTools.ts";

const DOLLAR = 1_000_000_000;
const ROOM = "#bubble";
const opened: { close: () => Promise<void> }[] = [];
afterEach(async () => {
  await Promise.all(opened.splice(0).map((served) => served.close()));
});

type Ask = (question: Question, signal: AbortSignal) => Promise<Result>;
type Translate = (asked: JarvisTranslate, signal: AbortSignal) => Promise<Translated>;
type DigestOf = (asked: JarvisDigestRequest, signal: AbortSignal, made?: () => void) => Promise<Digested>;
const asking = (result: Result) => vi.fn<Ask>(() => Promise.resolve(result));

// jarvis's routes on a port of their own, with the loop's ask the test gives (none: switched off) and a budget whose
// caps start at $45 and $5.
interface Served {
  ask?: Ask | undefined;
  translate?: Translate | undefined;
  digest?: DigestOf | undefined;
}
const served = async ({ ask, translate, digest }: Served = {}) => {
  const { log, events, raw } = capture();
  const budget = budgetFor(45 * DOLLAR);
  budget.budget.change("translate", 5 * DOLLAR);
  const jarvis = await serve(jarvisRoutes({ ask, translate, digest, budget: budget.budget, log }), {
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

describe("POST /translate: a message's translation", () => {
  const asked = (): JarvisTranslate => ({ text: "The vote closes at block 1,204.", language: "fr" });
  const translating = (result: Translated) => vi.fn<Translate>(() => Promise.resolve(result));

  it("answers off while jarvis is switched off, once its body passed its schema, before any work", async () => {
    const { post } = await served();
    const response = await post(JARVIS_PATHS.translate, asked());
    expect([response.status, JarvisTranslation.parse(await response.json())]).toEqual([200, { status: "off" }]);
    expect((await post(JARVIS_PATHS.translate, { ...asked(), room: "#bubble" })).status).toBe(400);
  });

  it("hands the text and its language to the translator with the request's signal, and answers its translation", async () => {
    const translate = translating({ kind: "translated", text: "Le vote se termine au bloc 1 204." });
    const { post } = await served({ translate });
    const response = await post(JARVIS_PATHS.translate, asked());
    expect([response.status, JarvisTranslation.parse(await response.json())]).toEqual([
      200,
      { status: "translated", text: "Le vote se termine au bloc 1 204." },
    ]);
    expect(translate.mock.calls.map(([value, signal]) => [value, signal instanceof AbortSignal])).toEqual([
      [asked(), true],
    ]);
  });

  it.each([
    ["the original", { kind: "original" }, [200, { status: "original" }]],
    ["spent", { kind: "spent" }, [200, { status: "spent" }]],
    ["a failure", { kind: "failed" }, [502, { error: "internal" }]],
    ["its asker gone", { kind: "gone" }, [503, { error: "not_ready" }]],
  ] as const)("answers %s as the door's schema reads it", async (_, result, answer) => {
    const { post } = await served({ translate: translating(result) });
    const response = await post(JARVIS_PATHS.translate, asked());
    expect([response.status, await response.json()]).toEqual(answer);
  });

  it("refuses a body its schema refuses, logged by its route, before any work", async () => {
    const translate = translating({ kind: "original" });
    const { post, events } = await served({ translate });
    for (const body of [{ text: "", language: "fr" }, { text: "Hi", language: "xx" }, { text: "Hi" }]) {
      expect((await post(JARVIS_PATHS.translate, body)).status).toBe(400);
    }
    expect(translate).not.toHaveBeenCalled();
    expect(events()[0]).toEqual({
      event: "jarvis_refused",
      route: JARVIS_PATHS.translate,
      method: "POST",
      status: 400,
      error: "refused",
    });
  });

  it("logs no text and no translation", async () => {
    const { post, raw } = await served({ translate: translating({ kind: "translated", text: "Le secret 42." }) });
    await post(JARVIS_PATHS.translate, { text: "The secret 42.", language: "fr" });
    expect(raw()).not.toMatch(/secret/i);
  });
});

describe("POST /digest: a realm's digest", () => {
  const asked = (): JarvisDigestRequest => ({ universe: "onyx", realm: "gno.land/r/demo/poll" });
  const made = (): Extract<JarvisMadeDigest, { status: "digest" }> => ({
    status: "digest",
    digest: { blocks: [{ type: "facts", facts: [{ label: "Members", value: "1,204" }] }] },
    proposal: null,
    height: 1204,
    made: false,
  });
  const digesting = (result: Digested) => vi.fn<DigestOf>(() => Promise.resolve(result));

  it("answers off while jarvis is switched off, once its body passed its schema, before any work", async () => {
    const { post } = await served();
    const response = await post(JARVIS_PATHS.digest, asked());
    expect([response.status, JarvisMadeDigest.parse(await response.json())]).toEqual([200, { status: "off" }]);
    expect((await post(JARVIS_PATHS.digest, { ...asked(), page: "# forged" })).status).toBe(400);
  });

  it("hands the realm to the digests with the request's signal, and answers the digest with its height", async () => {
    const { digest: body, height } = made();
    const digest = digesting({ kind: "digest", digest: body, proposal: null, height });
    const { post } = await served({ digest });
    const response = await post(JARVIS_PATHS.digest, asked());
    expect([response.status, JarvisMadeDigest.parse(await response.json())]).toEqual([200, made()]);
    expect(digest.mock.calls.map(([value, signal]) => [value, signal instanceof AbortSignal])).toEqual([
      [asked(), true],
    ]);
  });

  it.each([
    ["none", { kind: "none" }, [200, { status: "none", made: false }]],
    ["spent", { kind: "spent" }, [200, { status: "spent" }]],
    ["a universe jarvis does not read", { kind: "invalid" }, [400, { error: "refused" }]],
    ["a failure", { kind: "failed" }, [502, { error: "internal" }]],
    ["its asker gone", { kind: "gone" }, [503, { error: "not_ready" }]],
  ] as const)("answers %s as the door's schema reads it", async (_, result, answer) => {
    const { post } = await served({ digest: digesting(result) });
    const response = await post(JARVIS_PATHS.digest, asked());
    expect([response.status, await response.json()]).toEqual(answer);
  });

  it("are routes with the one method the door calls", () => {
    const { log } = capture();
    const routes = jarvisRoutes({ ask: undefined, budget: budgetFor(DOLLAR).budget, log });
    expect(Object.keys(routes[JARVIS_PATHS.translate] ?? {})).toEqual(["POST"]);
    expect(Object.keys(routes[JARVIS_PATHS.digest] ?? {})).toEqual(["POST"]);
  });

  it("says jarvis made the digest when its making told so, and only then (10k-1)", async () => {
    const result = { kind: "digest", digest: made().digest, proposal: null, height: 1204 } as const;
    const digest = vi.fn<DigestOf>((_asked, _signal, wasMade) => {
      wasMade?.();
      return Promise.resolve(result);
    });
    const { post } = await served({ digest });
    expect(await (await post(JARVIS_PATHS.digest, asked())).json()).toEqual({ ...made(), made: true });
  });
});

// The evals' cases (ADR-0002 §5; row 10; 10k's report), read as data from evals/: each request one jarvis's wire takes,
// each suite row 10 names present. The evals run apart, with a key; a change of the wire leaving a case behind fails
// here. Each value is built inside its test (F2356).
const folder = new URL("../../evals/cases/", import.meta.url);
const Expect = z.strictObject({
  status: z.array(z.string()).min(1),
  never_tools: z.array(z.string()).optional(),
  some_tools: z.array(z.string()).optional(),
  contains: z.array(z.string()).optional(),
  lacks: z.array(z.string()).optional(),
  rubric: z.string().min(20).optional(),
  made_at_most: z.int().min(0).optional(),
  proposal: z.literal("none").optional(),
  max_usd: z.number().positive().optional(),
  max_ms: z.int().positive().optional(),
});
const Recorded = z.strictObject({
  height: z.int().positive(),
  page: z.string().max(200 * 1024),
  functions: FunctionList,
});
// A realm as its case records it, or a recorded one of evals/chains/ by its name, the case's words after its page.
const Chain = z.union([
  Recorded,
  z
    .strictObject({ recorded: z.string().regex(/^[a-z0-9-]+$/), then: z.string().min(1).optional() })
    .transform(({ recorded, then = "" }) => {
      const file = new URL(`../../evals/chains/${recorded}.json`, import.meta.url);
      const chain = Recorded.parse(JSON.parse(readFileSync(file, "utf8")));
      return { ...chain, page: chain.page + then };
    }),
]);
const Case = z.strictObject({
  id: z.string().regex(/^[a-z0-9]+(-[a-z0-9]+)*$/),
  about: z.string().min(10),
  planted: z.string().min(4).optional(),
  spent: z.literal(true).optional(),
  repeat: z.int().min(2).max(4).optional(),
  ask: z.unknown().optional(),
  translate: z.unknown().optional(),
  digest: z.unknown().optional(),
  chain: Chain.optional(),
  expect: Expect,
});
type Case = z.infer<typeof Case>;
const Suite = z.strictObject({ suite: z.string(), cases: z.array(Case).min(1) });
const suites = () =>
  readdirSync(folder)
    .filter((name) => name.endsWith(".json"))
    .sort()
    .map((name) => ({ name, ...Suite.parse(JSON.parse(readFileSync(new URL(name, folder), "utf8"))) }));
const cases = () => suites().flatMap((suite) => suite.cases.map((one) => ({ ...one, suite: suite.suite })));
const kindOf = (one: Case) => (["ask", "translate", "digest"] as const).filter((kind) => one[kind] !== undefined);
// What each route answers (JarvisAnswer, JarvisTranslation, JarvisDigest).
const STATUSES = {
  ask: ["answered", "spent", "off"],
  translate: ["translated", "original", "spent", "off"],
  digest: ["digest", "none", "spent", "off"],
};
// The fewest cases a suite holds, so none is a token.
const LEAST = {
  injection: 6,
  allowlist: 3,
  refusals: 2,
  grounding: 3,
  "chain-facts": 4,
  proposals: 3,
  digest: 3,
  translation: 20,
  budget: 3,
};
// gnomcp's writes, which jarvis never offers: an ask that tempts one checks none ran.
const WRITES = ["gno_call", "gno_run", "gno_addpkg", "gno_key_send"];
// What /ask offers (D170) and what /digest offers (D199), by the names jarvis's own modules give.
const offered = () =>
  new Set([
    ...gnomcpTools({ chains: ["onyx"], indexed: ["onyx"] }).map((tool) => tool.name),
    ...gnoscopeTools(["onyx"]).map((tool) => tool.name),
    "load_skill",
    "find_place",
    "give_button",
    "give_digest",
    "propose_action",
  ]);

describe("the evals' cases", () => {
  it("hold every suite row 10, the chain facts and 10k ask for, each file named after its suite", () => {
    const names = suites().map((suite) => suite.suite);
    expect(names).toEqual(
      expect.arrayContaining([
        "injection",
        "allowlist",
        "grounding",
        "proposals",
        "budget",
        "translation",
        "chain-facts",
        "digest",
        "refusals",
      ]),
    );
    for (const suite of suites()) expect(suite.name).toBe(`${suite.suite}.json`);
  });

  it("each ask one thing of jarvis's wire, in the shape its route takes", () => {
    const ids = new Set<string>();
    for (const one of cases()) {
      expect(ids.has(one.id), one.id).toBe(false);
      ids.add(one.id);
      const kinds = kindOf(one);
      expect(kinds, one.id).toHaveLength(1);
      if (one.ask !== undefined) expect(JarvisAsk.safeParse(one.ask).success, one.id).toBe(true);
      if (one.translate !== undefined) expect(JarvisTranslate.safeParse(one.translate).success, one.id).toBe(true);
      if (one.digest !== undefined) {
        expect(JarvisDigestRequest.safeParse(one.digest).success, one.id).toBe(true);
        expect(one.chain, `${one.id}: a digest reads a recorded chain`).toBeDefined();
      } else expect(one.chain, one.id).toBeUndefined();
    }
  });

  it("expect only statuses each route answers, as its schema takes them", () => {
    const takes = (schema: zm.ZodMiniType, status: string) =>
      [
        { status },
        { status, markdown: "a", buttons: [] },
        { status, text: "a" },
        { status, digest: { blocks: [{ type: "text", markdown: "a" }] }, proposal: null, height: 1 },
      ].some((value) => schema.safeParse(value).success);
    const schemas = { ask: JarvisAnswer, translate: JarvisTranslation, digest: JarvisDigest };
    for (const kind of ["ask", "translate", "digest"] as const)
      for (const status of STATUSES[kind]) expect(takes(schemas[kind], status), status).toBe(true);
    for (const one of cases())
      for (const kind of kindOf(one))
        for (const status of one.expect.status) expect(STATUSES[kind], `${one.id}: ${status}`).toContain(status);
  });

  it("expect tools jarvis offers to run, and tools it never offers not to", () => {
    for (const one of cases()) {
      for (const tool of one.expect.some_tools ?? []) expect(offered().has(tool), `${one.id}: ${tool}`).toBe(true);
      for (const tool of one.expect.never_tools ?? []) expect(offered().has(tool), `${one.id}: ${tool}`).toBe(false);
    }
  });

  it("hold enough cases a suite to say something", () => {
    const counts = new Map(suites().map((suite) => [suite.suite, suite.cases.length]));
    for (const [suite, least] of Object.entries(LEAST))
      expect(counts.get(suite) ?? 0, suite).toBeGreaterThanOrEqual(least);
  });

  it("plant each injection where jarvis reads it, and check it changed nothing but words", () => {
    for (const one of cases().filter((each) => each.suite === "injection")) {
      expect(one.planted, one.id).toBeDefined();
      const read = JSON.stringify([one.ask, one.translate, one.chain?.page]);
      expect(read, one.id).toContain(JSON.stringify(one.planted ?? "").slice(1, -1));
      if (one.ask !== undefined) expect(one.expect.never_tools ?? [], one.id).toEqual(expect.arrayContaining(WRITES));
      else
        expect((one.expect.lacks ?? []).length + (one.expect.proposal === "none" ? 1 : 0), one.id).toBeGreaterThan(0);
    }
  });

  it("ask for every write in the allowlist's and the refusals' cases, never once run", () => {
    for (const one of cases().filter((each) => each.suite === "allowlist" || each.suite === "refusals"))
      expect(one.expect.never_tools ?? [], one.id).toEqual(expect.arrayContaining(WRITES));
  });

  it("ask a grounding question no tool can answer, which must give no invented figure", () => {
    const blind = cases().filter((one) => one.suite === "grounding" && one.expect.some_tools === undefined);
    expect(blind.length).toBeGreaterThan(0);
    for (const one of blind) expect(one.expect.rubric ?? "", one.id).toMatch(/invented/);
  });

  it("translate into each of jarvis's languages, and make a translation once for its readers", () => {
    const translations = cases().filter((one) => one.translate !== undefined);
    const languages = new Set(translations.map((one) => JarvisTranslate.parse(one.translate).language));
    expect([...languages].sort()).toEqual([...JARVIS_LANGUAGES].sort());
    const once = translations.filter((one) => one.repeat !== undefined);
    expect(once.length).toBeGreaterThan(0);
    for (const one of once) expect(one.expect.made_at_most, one.id).toBe(1);
  });

  it("stop each feature at the budget's end, as spent", () => {
    const spent = cases().filter((one) => one.spent === true);
    expect(new Set(spent.flatMap(kindOf))).toEqual(new Set(["ask", "translate", "digest"]));
    for (const one of spent) expect(one.expect.status, one.id).toEqual(["spent"]);
  });

  it("propose nothing for a function the realm's vm/qfuncs lacks", () => {
    const absent = cases().filter((one) => one.expect.proposal === "none" && one.digest !== undefined);
    const named = (one: Case) => /\b([A-Z][A-Za-z]+)\(/.exec(one.planted ?? "")?.[1];
    const listed = (one: Case) => new Set((one.chain?.functions ?? []).map((fn) => fn.FuncName));
    const missing = absent.filter((one) => named(one) !== undefined && !listed(one).has(named(one) ?? ""));
    expect(missing.length).toBeGreaterThanOrEqual(2);
  });

  it("read each chain fact through gnomcp's reads, with its height asked of the answer", () => {
    const facts = cases().filter((one) => one.suite === "chain-facts");
    const reads = new Set<string>(gnomcpTools({ chains: ["onyx"], indexed: ["onyx"] }).map((tool) => tool.name));
    for (const one of facts) {
      expect(
        (one.expect.some_tools ?? []).some((tool) => reads.has(tool)),
        one.id,
      ).toBe(true);
      expect(one.expect.rubric ?? "", one.id).toMatch(/height/);
    }
  });
});

describe("the evals' run", () => {
  const evals = (path: string) => readFileSync(new URL(`../../evals/${path}`, import.meta.url), "utf8");
  it("is graded by a model that answers none of the cases, jarvis's third model left unused", () => {
    const config = evals("promptfooconfig.yaml");
    const graders = [...config.matchAll(/provider: anthropic:messages:(\S+)/g)].map((match) => match[1]);
    expect(graders).toEqual(["claude-opus-5-5"]);
    const answering = [...config.matchAll(/JARVIS_MODEL(?:_FAST)?: (\S+)/g)].map((match) => match[1]);
    expect(answering).toEqual(["claude-sonnet-5-5", "claude-haiku-5-5"]);
    for (const model of [...graders, ...answering]) expect(MODELS).toContain(model);
    // JARVIS_MODEL_DEEP (Opus by default) answers nothing yet: were it used, the grader would grade its own answers.
    const modules = readdirSync(new URL(".", import.meta.url), { recursive: true, encoding: "utf8" });
    const using = modules.filter((path) => path.endsWith(".ts") && !path.endsWith(".test.ts"));
    for (const path of using)
      expect(readFileSync(new URL(path, import.meta.url), "utf8"), path).not.toMatch(/models\.deep/);
  });

  it("calls jarvis's real entry through its provider, its tests read from cases/, each answer kept", () => {
    const config = evals("promptfooconfig.yaml");
    expect(config).toMatch(/^ {2}- id: file:\/\/provider\.ts$/m);
    expect(config).toMatch(/^tests: file:\/\/tests\.ts$/m);
    expect(config).toMatch(/^ {2}cache: true$/m);
    expect(evals("tests.ts")).toContain(`readCases(fileURLToPath(new URL("cases", import.meta.url)))`);
    const started = evals("jarvis.ts");
    expect(started).toContain(`join(setup.root, "jarvis/src/main.ts")`);
    expect(started).toContain(`"--disallow-code-generation-from-strings"`);
    // The preload moves the universes' nodes alone; Anthropic's API is the real one.
    expect(started).toMatch(/setup\.universes\.map\(\(one\) => \[new URL\(one\.rpc\)\.origin/);
    for (const path of ["jarvis.ts", "provider.ts", "fakes.ts"]) expect(evals(path)).not.toMatch(/anthropic\.com/);
  });

  it("is installed apart, from its own package file, promptfoo pinned", () => {
    const manifest = z
      .object({ devDependencies: z.record(z.string(), z.string()) })
      .parse(JSON.parse(evals("package.json")));
    expect(manifest.devDependencies["promptfoo"]).toBe("0.125.1");
    expect(readFileSync(new URL("../../pnpm-workspace.yaml", import.meta.url), "utf8")).not.toMatch(/evals/);
    expect(evals("pnpm-workspace.yaml")).toMatch(/^packages: \[\]$/m);
    expect(evals("pnpm-workspace.yaml")).toMatch(/^minimumReleaseAge: 1440$/m);
    expect(evals("pnpm-workspace.yaml")).toMatch(/^trustPolicy: no-downgrade$/m);
  });
});

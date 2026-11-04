import { inspect } from "node:util";
import {
  APIConnectionError,
  APIConnectionTimeoutError,
  APIError,
  APIUserAbortError,
  type ClientOptions,
} from "@anthropic-ai/sdk";
import { trace as otel } from "@opentelemetry/api";
import { InMemorySpanExporter, SimpleSpanProcessor, TracerProvider } from "@opentelemetry/sdk-trace";
import { afterEach, describe, expect, it, vi } from "vitest";
import { Secret } from "../settings.ts";
import { callModel, connectAnthropic, type Request as ModelRequest } from "./model.ts";
import { cost, worstCost, type Model } from "./prices.ts";
import { message, script, text, usage } from "./testing/fakeModel.ts";
import { budgetFor, capture, spans } from "./testing/kit.ts";
import { traceQuestion } from "./tracing.ts";

// A key the test makes up: no real key is ever read here.
const KEY = `sk-ant-made-up-${"k".repeat(48)}`;
const MODEL: Model = "claude-sonnet-5-5";
const HOUR = 3_600_000;

const ask = (): ModelRequest & { model: Model } => ({
  model: MODEL,
  max_tokens: 64,
  messages: [{ role: "user", content: "What block is it?" }],
});

const json = (body: unknown, status = 200, headers: Record<string, string> = {}) =>
  new Response(JSON.stringify(body), { status, headers: { "content-type": "application/json", ...headers } });
const answered = () => json(message({ content: [text("Block 42.")], stop: "end_turn" }));
const failing = (status: number, headers: Record<string, string> = {}) =>
  json({ type: "error", error: { type: "api_error", message: "made-up failure" } }, status, headers);

// A fetch that answers each call in turn, keeping each call's URL, headers and body.
const fetcher = (...answers: ((init: RequestInit) => Response | Promise<Response>)[]) => {
  const calls: { url: string; init: RequestInit }[] = [];
  const fetch: NonNullable<ClientOptions["fetch"]> = async (input, init = {}) => {
    calls.push({ url: input instanceof Request ? input.url : String(input), init });
    const next = answers.shift();
    if (next === undefined) throw new Error("the fake fetch was called once more than the test planned");
    return next(init);
  };
  return { fetch, calls };
};
const headersOf = (init: RequestInit) => Object.fromEntries(new Headers(init.headers).entries());
const bodyOf = (init: RequestInit): unknown => JSON.parse(typeof init.body === "string" ? init.body : "null");

afterEach(() => {
  vi.unstubAllEnvs();
  vi.restoreAllMocks();
  otel.disable();
});

describe("connectAnthropic: the SDK's one client", () => {
  it("sends each request to Anthropic's messages API with the key, at the global inference and the standard tier", async () => {
    const { fetch, calls } = fetcher(() => answered());
    const send = connectAnthropic(new Secret(KEY), 1_000, fetch);
    const answer = await send({ ...ask(), inference_geo: "us", service_tier: "auto" });
    expect(answer.content).toEqual([text("Block 42.")]);
    expect(calls).toHaveLength(1);
    const [call] = calls;
    expect(call?.url).toBe("https://api.anthropic.com/v1/messages");
    expect(bodyOf(call?.init ?? {})).toMatchObject({
      ...ask(),
      inference_geo: "global",
      service_tier: "standard_only",
    });
    const headers = headersOf(call?.init ?? {});
    expect(Object.values(headers).some((value) => value.includes(KEY))).toBe(true);
    expect(JSON.stringify(bodyOf(call?.init ?? {}))).not.toContain(KEY);
    // The plain messages API: no beta, so no server-side fallback (a decision of this part's, in docs/decisions.md).
    expect(headers["anthropic-beta"]).toBeUndefined();
    expect(bodyOf(call?.init ?? {})).not.toHaveProperty("fallbacks");
  });

  it("sends the key to Anthropic's host whatever the environment names, and no other credential", async () => {
    vi.stubEnv("ANTHROPIC_BASE_URL", "https://elsewhere.example");
    vi.stubEnv("ANTHROPIC_AUTH_TOKEN", "a-token-from-the-environment");
    vi.stubEnv("ANTHROPIC_API_KEY", "a-key-from-the-environment");
    vi.stubEnv("ANTHROPIC_PROFILE", "a-profile-from-the-environment");
    vi.stubEnv("ANTHROPIC_IDENTITY_TOKEN", "an-identity-from-the-environment");
    vi.stubEnv("ANTHROPIC_FEDERATION_RULE_ID", "a-rule-from-the-environment");
    vi.stubEnv("ANTHROPIC_ORGANIZATION_ID", "an-organization-from-the-environment");
    vi.stubEnv("ANTHROPIC_SERVICE_ACCOUNT_ID", "an-account-from-the-environment");
    const { fetch, calls } = fetcher(() => answered());
    await connectAnthropic(new Secret(KEY), 1_000, fetch)(ask());
    expect(calls[0]?.url).toBe("https://api.anthropic.com/v1/messages");
    const sent = JSON.stringify(headersOf(calls[0]?.init ?? {}));
    expect(sent).not.toContain("from-the-environment");
  });

  it("refuses to make the client when the environment would add headers to every request, naming it", () => {
    vi.stubEnv("ANTHROPIC_CUSTOM_HEADERS", "anthropic-beta: a-beta-from-the-environment");
    expect(() => connectAnthropic(new Secret(KEY), 1_000, fetcher().fetch)).toThrow(
      "model: ANTHROPIC_CUSTOM_HEADERS is set, and jarvis sends no header of its environment's",
    );
  });

  it("follows no redirect, as the server's one way out (net.ts)", async () => {
    const { fetch, calls } = fetcher(() => answered());
    await connectAnthropic(new Secret(KEY), 1_000, fetch)(ask());
    expect(calls[0]?.init.redirect).toBe("error");
  });

  it.each([
    ["a 500", () => failing(500)],
    ["a 529", () => failing(529)],
    ["a 429", () => failing(429, { "retry-after": "0" })],
    ["a 408", () => failing(408)],
  ])("tries once: %s throws the SDK's error after one request, the loop retrying itself", async (_case, answer) => {
    const { fetch, calls } = fetcher(() => answer());
    await expect(connectAnthropic(new Secret(KEY), 1_000, fetch)(ask())).rejects.toBeInstanceOf(APIError);
    expect(calls).toHaveLength(1);
  });

  it("tries once: a dropped connection throws a connection error after one request", async () => {
    const { fetch, calls } = fetcher(() => Promise.reject(new TypeError("fetch failed")));
    await expect(connectAnthropic(new Secret(KEY), 1_000, fetch)(ask())).rejects.toBeInstanceOf(APIConnectionError);
    expect(calls).toHaveLength(1);
  });

  it("ends an attempt at its timeout with the SDK's timeout error", async () => {
    const hung = (init: RequestInit) =>
      new Promise<Response>((_resolve, reject) => {
        init.signal?.addEventListener("abort", () => {
          reject(new DOMException("aborted", "AbortError"));
        });
      });
    const { fetch } = fetcher(hung);
    const started = performance.now();
    await expect(connectAnthropic(new Secret(KEY), 50, fetch)(ask())).rejects.toBeInstanceOf(APIConnectionTimeoutError);
    expect(performance.now() - started).toBeLessThan(2_000);
  });

  it("writes nothing to the console, even with ANTHROPIC_LOG at debug: the log is jarvis's JSON lines", async () => {
    vi.stubEnv("ANTHROPIC_LOG", "debug");
    const printed = (["log", "info", "debug", "warn", "error"] as const).map((name) =>
      vi.spyOn(console, name).mockImplementation(() => undefined),
    );
    const { fetch } = fetcher(
      () => answered(),
      () => failing(500),
    );
    const send = connectAnthropic(new Secret(KEY), 1_000, fetch);
    await send(ask());
    await expect(send(ask())).rejects.toBeInstanceOf(APIError);
    for (const spy of printed) expect(spy).not.toHaveBeenCalled();
  });

  it("never shows the key in an error", async () => {
    const { fetch } = fetcher(
      () => failing(401),
      () => Promise.reject(new TypeError("fetch failed")),
    );
    const send = connectAnthropic(new Secret(KEY), 1_000, fetch);
    for (let attempt = 0; attempt < 2; attempt += 1) {
      const error: unknown = await send(ask()).catch((caught: unknown) => caught);
      expect(error).toBeInstanceOf(Error);
      expect(`${String(error)} ${inspect(error, { depth: 8 })} ${JSON.stringify(error)}`).not.toContain(KEY);
    }
  });

  it("makes no span of the SDK's own, even with a tracer provider registered: jarvis's spans are its own", async () => {
    const exporter = new InMemorySpanExporter();
    otel.setGlobalTracerProvider(new TracerProvider({ spanProcessors: [new SimpleSpanProcessor({ exporter })] }));
    const { fetch } = fetcher(() => answered());
    await connectAnthropic(new Secret(KEY), 1_000, fetch)(ask());
    expect(exporter.getFinishedSpans()).toEqual([]);
  });
});

// The SDK's own error for a status, as its client builds it from a response.
const statusError = (status: number, headers: Record<string, string> = {}) =>
  APIError.generate(
    status,
    { type: "error", error: { type: "api_error", message: "made-up" } },
    "made-up",
    new Headers(headers),
  );

const attempts = (cap: number, retries = 2) => {
  const { budget, clock, close } = budgetFor(cap);
  const { log, events } = capture();
  const { tracer, finished } = spans();
  const waits: number[] = [];
  const parts = {
    budget,
    retries,
    log,
    trace: traceQuestion(tracer, { model: MODEL, version: "v1" }),
    wait: (ms: number) => {
      waits.push(ms);
      return Promise.resolve();
    },
  };
  return { parts, budget, clock, close, events, finished, waits };
};
const DOLLAR = 1_000_000_000;
const worstOf = (request: ModelRequest) =>
  worstCost(MODEL, { inputBytes: Buffer.byteLength(JSON.stringify(request)), maxTokens: request.max_tokens });

describe("callModel: one model request, each attempt reserved and settled", () => {
  it("reserves the worst of the request it sends before sending it, then settles the answer's real cost", async () => {
    const run = attempts(45 * DOLLAR);
    let reserved = -1;
    let worst = -1;
    const answer = message({
      content: [text("Block 42.")],
      stop: "end_turn",
      usage: usage({ input_tokens: 40, output_tokens: 8 }),
    });
    const { send, requests } = script((request) => {
      reserved = run.budget.state("ask").reserved;
      worst = worstOf(request);
      return Promise.resolve(answer);
    });
    const called = await callModel({ ...run.parts, send }, ask());
    expect(called).toEqual({ ok: true, answer });
    expect(reserved).toBe(worst);
    expect(requests[0]).toMatchObject({ inference_geo: "global", service_tier: "standard_only" });
    expect(run.budget.state("ask")).toEqual({ spent: cost(MODEL, answer.usage), reserved: 0, cap: 45 * DOLLAR });
    expect(run.events().filter((event) => event["event"] === "jarvis_budget_settle")).toEqual([]);
    run.close();
  });

  it("sends nothing once the day is spent: `spent` as a value", async () => {
    const run = attempts(1);
    const { send, requests } = script();
    expect(await callModel({ ...run.parts, send }, ask())).toEqual({ ok: false, reason: "spent" });
    expect(requests).toEqual([]);
    run.close();
  });

  it("retries a 500 two times at most, each attempt its own hold, each failed one charged its worst", async () => {
    const run = attempts(45 * DOLLAR);
    const { send, requests } = script(statusError(500), statusError(503), statusError(529));
    expect(await callModel({ ...run.parts, send }, ask())).toEqual({ ok: false, reason: "failed" });
    expect(requests).toHaveLength(3);
    const worst = worstOf(requests[0] ?? ask());
    expect(run.budget.state("ask")).toEqual({ spent: 3 * worst, reserved: 0, cap: 45 * DOLLAR });
    run.close();
  });

  it("sends no retry its reserve does not fit: `spent`, the failed attempt charged its one worst", async () => {
    const worst = worstOf({ ...ask(), inference_geo: "global", service_tier: "standard_only" });
    const run = attempts(Math.floor(worst * 1.5));
    const answer = message({ content: [text("Block 42.")], stop: "end_turn" });
    const { send, requests } = script(statusError(500), answer);
    expect(await callModel({ ...run.parts, send }, ask())).toEqual({ ok: false, reason: "spent" });
    expect(requests).toHaveLength(1);
    expect(run.budget.state("ask")).toEqual({ spent: worst, reserved: 0, cap: Math.floor(worst * 1.5) });
    run.close();
  });

  it.each(["claude-haiku-5-5", "claude-opus-5-5"] as const)(
    "reserves on the card of the request's own model, %s",
    async (model) => {
      const run = attempts(45 * DOLLAR);
      let reserved = -1;
      let worst = -1;
      const { send } = script((request) => {
        reserved = run.budget.state("ask").reserved;
        worst = worstCost(model, {
          inputBytes: Buffer.byteLength(JSON.stringify(request)),
          maxTokens: request.max_tokens,
        });
        return Promise.resolve(message({ content: [], stop: "end_turn", model }));
      });
      await callModel({ ...run.parts, send }, { ...ask(), model });
      expect(reserved).toBe(worst);
      expect(reserved).not.toBe(worstOf({ ...ask(), inference_geo: "global", service_tier: "standard_only" }));
      run.close();
    },
  );

  it("takes the answer of a retry, the failed attempt charged its worst and the answer its real cost", async () => {
    const run = attempts(45 * DOLLAR);
    const answer = message({ content: [text("Block 42.")], stop: "end_turn" });
    const { send, requests } = script(statusError(429), answer);
    expect(await callModel({ ...run.parts, send }, ask())).toEqual({ ok: true, answer });
    const worst = worstOf(requests[0] ?? ask());
    expect(run.budget.state("ask").spent).toBe(worst + Number(cost(MODEL, answer.usage)));
    run.close();
  });

  it("sends once with no retry when the setting says none", async () => {
    const run = attempts(45 * DOLLAR, 0);
    const { send, requests } = script(statusError(500));
    expect(await callModel({ ...run.parts, send }, ask())).toEqual({ ok: false, reason: "failed" });
    expect(requests).toHaveLength(1);
    run.close();
  });

  it.each([400, 401, 403, 404, 413, 422])("does not retry a %i, which the API refused for good", async (status) => {
    const run = attempts(45 * DOLLAR);
    const { send, requests } = script(statusError(status));
    expect(await callModel({ ...run.parts, send }, ask())).toEqual({ ok: false, reason: "failed" });
    expect(requests).toHaveLength(1);
    run.close();
  });

  it("retries a 408, a 409 and a dropped connection, as the SDK would", async () => {
    const run = attempts(45 * DOLLAR);
    const answer = message({ content: [text("Block 42.")], stop: "end_turn" });
    const dropped = new APIConnectionError({ message: "made-up" });
    const { send, requests } = script(statusError(408), statusError(409), answer);
    expect(await callModel({ ...run.parts, send }, ask())).toEqual({ ok: true, answer });
    expect(requests).toHaveLength(3);
    const again = script(dropped, answer);
    expect(await callModel({ ...run.parts, send: again.send }, ask())).toEqual({ ok: true, answer });
    run.close();
  });

  it.each([
    [
      "an error of no status that asks a retry",
      () => new APIError(undefined, undefined, "made-up", new Headers({ "x-should-retry": "true" })),
    ],
    ["an abort", () => new APIUserAbortError()],
  ])("never retries %s", async (_case, error) => {
    const run = attempts(45 * DOLLAR);
    const { send, requests } = script(error());
    expect(await callModel({ ...run.parts, send }, ask())).toEqual({ ok: false, reason: "failed" });
    expect(requests).toHaveLength(1);
    run.close();
  });

  it("retries a 500 that came with no headers, at its own pace", async () => {
    const run = attempts(45 * DOLLAR);
    // APIError.generate would make a connection error of a status with no headers: the class itself keeps both.
    const bare = () =>
      new APIError(500, { type: "error", error: { type: "api_error", message: "made-up" } }, "made-up", undefined);
    const { send, requests } = script(bare(), bare(), bare());
    expect(await callModel({ ...run.parts, send }, ask())).toEqual({ ok: false, reason: "failed" });
    expect(requests).toHaveLength(3);
    expect(run.waits).toEqual([500, 1_000]);
    run.close();
  });

  it("obeys the API's x-should-retry, either way", async () => {
    const run = attempts(45 * DOLLAR);
    const answer = message({ content: [text("Block 42.")], stop: "end_turn" });
    const told = script(statusError(400, { "x-should-retry": "true" }), answer);
    expect(await callModel({ ...run.parts, send: told.send }, ask())).toEqual({ ok: true, answer });
    const refused = script(statusError(500, { "x-should-retry": "false" }));
    expect(await callModel({ ...run.parts, send: refused.send }, ask())).toEqual({ ok: false, reason: "failed" });
    expect(refused.requests).toHaveLength(1);
    run.close();
  });

  it("gives a timeout as its own reason once its retries are spent", async () => {
    const run = attempts(45 * DOLLAR);
    const timedOut = () => new APIConnectionTimeoutError();
    const { send, requests } = script(timedOut(), timedOut(), timedOut());
    expect(await callModel({ ...run.parts, send }, ask())).toEqual({ ok: false, reason: "timeout" });
    expect(requests).toHaveLength(3);
    run.close();
  });

  it("gives the last attempt's reason when the errors differ", async () => {
    const run = attempts(45 * DOLLAR);
    const timedOut = () => new APIConnectionTimeoutError();
    const last = script(timedOut(), statusError(500), timedOut());
    expect(await callModel({ ...run.parts, send: last.send }, ask())).toEqual({ ok: false, reason: "timeout" });
    const other = script(timedOut(), timedOut(), statusError(500));
    expect(await callModel({ ...run.parts, send: other.send }, ask())).toEqual({ ok: false, reason: "failed" });
    run.close();
  });

  it("settles a hold at its worst at once, and throws, when send fails with no error of the SDK's: a bug", async () => {
    const run = attempts(45 * DOLLAR);
    const bug = new TypeError("not the SDK's");
    const { send, requests } = script(bug, message({ content: [], stop: "end_turn" }));
    await expect(callModel({ ...run.parts, send }, ask())).rejects.toBe(bug);
    expect(requests).toHaveLength(1);
    expect(run.finished()[0]?.attributes["error.type"]).toBe("TypeError");
    const worst = worstOf(requests[0] ?? ask());
    expect(run.budget.state("ask")).toEqual({ spent: worst, reserved: 0, cap: 45 * DOLLAR });
    run.close();
  });

  it("lets a value thrown by send that is no Error rise, its span marked unknown", async () => {
    const run = attempts(45 * DOLLAR);
    const thrown: unknown = "not an error";
    const { send } = script(() => {
      throw thrown;
    });
    await expect(callModel({ ...run.parts, send }, ask())).rejects.toBe(thrown);
    expect(run.finished()[0]?.attributes["error.type"]).toBe("unknown");
    run.close();
  });

  it("waits half a second, then a second, between attempts when the API asks no wait", async () => {
    const run = attempts(45 * DOLLAR);
    await callModel({ ...run.parts, send: script(statusError(500), statusError(500), statusError(500)).send }, ask());
    expect(run.waits).toEqual([500, 1_000]);
    run.close();
  });

  it.each([
    ["retry-after: 2", { "retry-after": "2" }, 2_000],
    ["retry-after: 8", { "retry-after": "8" }, 8_000],
    ["retry-after: 0, no wait asked", { "retry-after": "0" }, 500],
    ["retry-after: soon, no number", { "retry-after": "soon" }, 500],
    ["retry-after as a date, which jarvis does not read", { "retry-after": "Wed, 04 Nov 2026 12:00:09 GMT" }, 500],
    ["retry-after-ms: 8000", { "retry-after-ms": "8000" }, 8_000],
    ["retry-after-ms first", { "retry-after-ms": "150", "retry-after": "3" }, 150],
  ])("waits what the API asks, %s", async (_case, headers, wait) => {
    const run = attempts(45 * DOLLAR);
    const answer = message({ content: [text("Block 42.")], stop: "end_turn" });
    await callModel({ ...run.parts, send: script(statusError(429, headers), answer).send }, ask());
    expect(run.waits).toEqual([wait]);
    run.close();
  });

  it.each([
    ["retry-after: 30", { "retry-after": "30" }],
    ["retry-after: 9", { "retry-after": "9" }],
    ["retry-after-ms: 8001", { "retry-after-ms": "8001" }],
  ])(
    "does not retry when the API asks a wait past 8 s (%s), which would charge another worst for nothing",
    async (_case, headers) => {
      const run = attempts(45 * DOLLAR);
      const { send, requests } = script(statusError(429, headers));
      expect(await callModel({ ...run.parts, send }, ask())).toEqual({ ok: false, reason: "failed" });
      expect(requests).toHaveLength(1);
      expect(run.waits).toEqual([]);
      run.close();
    },
  );

  it("waits what retry-after-ms asks", async () => {
    const run = attempts(45 * DOLLAR);
    const answer = message({ content: [text("Block 42.")], stop: "end_turn" });
    await callModel({ ...run.parts, send: script(statusError(429, { "retry-after-ms": "150" }), answer).send }, ask());
    expect(run.waits).toEqual([150]);
    run.close();
  });

  it("logs and traces each alert the budget returns, 80% and then 100%", async () => {
    const answer = message({ content: [text("Block 42.")], stop: "end_turn", usage: usage({ output_tokens: 10 }) });
    const probe = attempts(45 * DOLLAR);
    let worst = 0;
    await callModel(
      {
        ...probe.parts,
        send: script((request) => {
          worst = worstOf(request);
          return Promise.resolve(answer);
        }).send,
      },
      ask(),
    );
    probe.close();
    // A cap the first worst fills to 90%: 80 then; the next call no longer fits: 100.
    const run = attempts(Math.ceil((worst * 10) / 9));
    await callModel({ ...run.parts, send: script(answer).send }, ask());
    expect(await callModel({ ...run.parts, send: script().send }, ask())).toEqual({ ok: false, reason: "spent" });
    const alerts = run.events().filter((event) => event["event"] === "jarvis_budget_alert");
    expect(alerts).toEqual([
      { event: "jarvis_budget_alert", reason: "80" },
      { event: "jarvis_budget_alert", reason: "100" },
    ]);
    run.parts.trace.end("spent", 1);
    const question = run.finished().find((span) => span.name === "jarvis.question");
    expect(question?.events.map((event) => [event.name, event.attributes?.["jarvis.level"]])).toEqual([
      ["jarvis.budget_alert", 80],
      ["jarvis.budget_alert", 100],
    ]);
    run.close();
  });

  it("logs a settle over its worst, unpriced or gone, the bug or the lateness it is", async () => {
    const run = attempts(45 * DOLLAR);
    const huge = message({ content: [], stop: "end_turn", usage: usage({ output_tokens: 10_000 }) });
    const unpriced = message({ content: [], stop: "end_turn", model: "claude-opus-4-8" });
    const late = () => {
      run.clock.now += HOUR;
      return Promise.resolve(message({ content: [], stop: "end_turn" }));
    };
    for (const step of [huge, unpriced, late]) await callModel({ ...run.parts, send: script(step).send }, ask());
    const settles = run.events().filter((event) => event["event"] === "jarvis_budget_settle");
    expect(settles).toEqual([
      { event: "jarvis_budget_settle", reason: "over" },
      { event: "jarvis_budget_settle", reason: "unpriced" },
      { event: "jarvis_budget_settle", reason: "gone" },
    ]);
    run.close();
  });

  it("logs each failed attempt by its error's class and status, never its message", async () => {
    const run = attempts(45 * DOLLAR, 1);
    await callModel({ ...run.parts, send: script(statusError(500), new APIConnectionTimeoutError()).send }, ask());
    expect(run.events().filter((event) => event["event"] === "jarvis_model_error")).toEqual([
      { event: "jarvis_model_error", error: "InternalServerError", status: 500 },
      { event: "jarvis_model_error", error: "APIConnectionTimeoutError" },
    ]);
    run.close();
  });

  it("makes a span for each attempt under the question's, the failed ones marked as errors", async () => {
    const run = attempts(45 * DOLLAR);
    const answer = message({ content: [text("Block 42.")], stop: "end_turn" });
    await callModel({ ...run.parts, send: script(statusError(500), answer).send }, ask());
    run.parts.trace.end("answer", 1);
    const finished = run.finished();
    const parent = finished.at(-1)?.spanContext().spanId;
    const shape = finished.map((span) => [
      span.name,
      span.parentSpanContext?.spanId,
      span.status.code,
      span.attributes["jarvis.attempt"],
    ]);
    expect(shape).toEqual([
      ["jarvis.model_request", parent, 2, 1],
      ["jarvis.model_request", parent, 1, 2],
      ["jarvis.question", undefined, 0, undefined],
    ]);
    const worst = worstOf({ ...ask(), inference_geo: "global", service_tier: "standard_only" });
    const real = Number(cost(MODEL, answer.usage));
    expect(finished.map((span) => span.attributes["jarvis.cost_nano_usd"])).toEqual([worst, real, worst + real]);
    expect(finished[1]?.attributes).toMatchObject({
      "gen_ai.usage.input_tokens": answer.usage.input_tokens,
      "gen_ai.usage.output_tokens": answer.usage.output_tokens,
    });
    run.close();
  });
});

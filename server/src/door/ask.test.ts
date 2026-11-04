import { createHmac } from "node:crypto";
import type { DatabaseSync } from "node:sqlite";
import { Address, type JarvisAnswer, type JarvisAsk } from "@gnoworld/schemas";
import { afterEach, describe, expect, it } from "vitest";
import { BODY_LIMIT, makeApp } from "../app.ts";
import { openDatabase } from "../db.ts";
import { logger } from "../log.ts";
import { askRoutes } from "./ask.ts";
import type { Jarvis } from "./jarvis.ts";
import { makeQuota, QUOTA_TABLES } from "./quota.ts";

// 10g: POST /api/jarvis/ask, each check before any work, in the brief's order (D42, D43, D44, D93).
const T0 = Date.parse("2026-11-04T12:00:00.000Z");
const ORIGIN = "https://gnoworld.test";
const PEER = "203.0.113.7";
const PEPPER = "a-pepper-of-forty-characters-0123456789";
const ANNA = Address.parse("g1jg8mtutu9khhfwc4nxmuhcpftf0pajdhfvsqf5");
const BEN = Address.parse("g10gh7yq7swv77efwfcqy2znp37cmeughxx3y5tv");
const TOKENS = new Map<string, Address>([
  ["anna-token-of-forty-three-characters-000000", ANNA],
  ["ben-token-of-forty-three-characters-0000000", BEN],
]);
const ANNA_TOKEN = "anna-token-of-forty-three-characters-000000";
const BEN_TOKEN = "ben-token-of-forty-three-characters-0000000";
const QUESTION = "What did they decide about the poll?";
const LINES = () => [{ speaker: 1, text: "the poll closes today", time: "2026-11-04T11:59:00.000Z" }];
type Asked = Awaited<ReturnType<Jarvis["ask"]>>;
const ANSWER = (): JarvisAnswer => ({ status: "answered", markdown: "It closes today.", buttons: [] });
// One code point, two code units: the cap counts code points, as Zod does.
const wide = (count: number) => String.fromCodePoint(0x1f600).repeat(count);

const opened: DatabaseSync[] = [];
afterEach(() => {
  for (const db of opened.splice(0)) db.close();
});

interface Options {
  on?: boolean;
  questionChars?: number;
  perMinute?: number;
  named?: boolean;
  answer?: () => Promise<Asked>;
}

const setup = ({ on = true, questionChars = 2000, perMinute = 6, named = true, answer }: Options = {}) => {
  const db = openDatabase(":memory:", [QUOTA_TABLES]);
  opened.push(db);
  const clock = { now: T0 };
  const quota = makeQuota(db, { first: { quota: 20, quotaUnnamed: 5, unlimited: [] }, now: () => clock.now });
  const lines: string[] = [];
  const log = logger(PEPPER, (line) => lines.push(line));
  const work: string[] = [];
  const sent: { request: JarvisAsk; signal: AbortSignal }[] = [];
  const app = makeApp(log, () => true);
  app.route(
    "/api/jarvis",
    askRoutes({
      session: (token) => TOKENS.get(token ?? ""),
      origins: [ORIGIN],
      mayRead: (room, who) => {
        work.push(`read ${room}`);
        return room !== "#bubble/crew" || who === BEN;
      },
      recent: (room, asker) => {
        work.push(`lines ${room} ${asker}`);
        return LINES();
      },
      named: async () => {
        work.push("named");
        await new Promise((resolve) => setTimeout(resolve, 1));
        return named;
      },
      quota,
      jarvis: {
        ask: (request, signal) => {
          work.push("jarvis");
          sent.push({ request, signal });
          return answer === undefined ? Promise.resolve({ ok: true, answer: ANSWER() }) : answer();
        },
      },
      on,
      questionChars,
      perMinute,
      log,
      now: () => clock.now,
    }),
  );
  interface Ask {
    body?: unknown;
    token?: string | null;
    origin?: string | null;
    type?: string | null;
    signal?: AbortSignal;
  }
  const ask = ({ body, token = ANNA_TOKEN, origin = ORIGIN, type = "application/json", signal }: Ask = {}) =>
    app.request(
      "/api/jarvis/ask",
      {
        method: "POST",
        headers: {
          ...(origin === null ? {} : { origin }),
          ...(type === null ? {} : { "content-type": type }),
          ...(token === null ? {} : { cookie: `__Host-session=${token}` }),
        },
        body: body === undefined ? JSON.stringify({ question: QUESTION, room: "#bubble" }) : JSON.stringify(body),
        ...(signal === undefined ? {} : { signal }),
      },
      { incoming: { socket: { remoteAddress: PEER } } },
    );
  // The log's lines, their time left out.
  const events = () => lines.map((line) => line.replace(/^\{"time":"[^"]+",/, "{"));
  const counted = () => db.prepare("SELECT account, day, count FROM jarvis_asked").all();
  return { ask, clock, quota, work, sent, events, counted, logged: lines };
};
const answerOf = async (response: Response) => [response.status, await response.json()];

describe("a question to Jarvis", () => {
  it("is passed to jarvis with the room and its lines, and jarvis's answer passed on as it is", async () => {
    const { ask, work, sent } = setup();
    expect(await answerOf(await ask())).toEqual([200, ANSWER()]);
    expect(work).toEqual(["read #bubble", `lines #bubble ${ANNA}`, "named", "jarvis"]);
    expect(sent.map(({ request }) => request)).toEqual([{ question: QUESTION, room: "#bubble", lines: LINES() }]);
  });

  it("answers off while Jarvis is switched off, after the site, the type and the session, before any other work", async () => {
    const { ask, work, sent, counted, events } = setup({ on: false });
    expect((await ask({ origin: "https://evil.test" })).status).toBe(403);
    expect((await ask({ type: "text/plain" })).status).toBe(415);
    expect((await ask({ token: null })).status).toBe(401);
    for (let at = 0; at < 8; at += 1) expect(await answerOf(await ask())).toEqual([200, { status: "off" }]);
    expect([work, sent, counted()]).toEqual([[], [], []]);
    const hashed = createHmac("sha256", PEPPER).update(ANNA).digest("hex");
    expect(events().at(-1)).toBe(
      `{"event":"jarvis_off","route":"/api/jarvis/ask","status":200,"account":"${hashed}"}\n`,
    );
  });

  it("is refused before any work from another site, in another type than JSON, or with no session", async () => {
    const { ask, work, counted } = setup();
    const refusals: [Parameters<typeof ask>[0], number, string][] = [
      [{ origin: "https://evil.test" }, 403, "forbidden"],
      [{ origin: null }, 403, "forbidden"],
      [{ type: "text/plain" }, 415, "unsupported"],
      [{ token: null }, 401, "unauthenticated"],
      [{ token: "a-token-nobody-holds-000000000000000000000" }, 401, "unauthenticated"],
    ];
    for (const [asked, status, error] of refusals)
      expect(await answerOf(await ask(asked))).toEqual([status, { error }]);
    expect([work, counted()]).toEqual([[], []]);
  });

  it("holds a question to the cap its setting gives, in code points, and refuses one past it before any work", async () => {
    const { ask, work } = setup();
    expect((await ask({ body: { question: wide(2001), room: "#bubble" } })).status).toBe(400);
    expect(work).toEqual([]);
    expect((await ask({ body: { question: wide(2000), room: "#bubble" } })).status).toBe(200);
    const small = setup({ questionChars: 10 });
    expect(await answerOf(await small.ask({ body: { question: "a".repeat(11), room: "#bubble" } }))).toEqual([
      400,
      { error: "refused" },
    ]);
    expect((await small.ask({ body: { question: "a".repeat(10), room: "#bubble" } })).status).toBe(200);
  });

  it("refuses a body past the server's limit before any work", async () => {
    const { ask, work, counted } = setup();
    expect(await answerOf(await ask({ body: { question: "a".repeat(BODY_LIMIT), room: "#bubble" } }))).toEqual([
      413,
      { error: "too_large" },
    ]);
    expect([work, counted()]).toEqual([[], []]);
  });

  it("refuses a body that is no question, before any work", async () => {
    const { ask, work } = setup();
    const bodies = [
      { question: QUESTION },
      { question: QUESTION, room: "#bubble", lines: LINES() },
      { question: "", room: "#bubble" },
      { question: QUESTION, room: "bubble" },
      "not an object",
    ];
    for (const body of bodies) expect(await answerOf(await ask({ body }))).toEqual([400, { error: "refused" }]);
    expect(work).toEqual([]);
  });

  it("refuses a question from a room the asker may not read, before its lines, the quota or jarvis", async () => {
    const { ask, work, counted } = setup();
    expect(await answerOf(await ask({ body: { question: QUESTION, room: "#bubble/crew" } }))).toEqual([
      403,
      { error: "forbidden" },
    ]);
    expect([work, counted()]).toEqual([["read #bubble/crew"], []]);
    const member = await ask({ body: { question: QUESTION, room: "#bubble/crew" }, token: BEN_TOKEN });
    expect(member.status).toBe(200);
  });

  it("holds an account to its rate a minute, counted before the body is read", async () => {
    const { ask, clock } = setup();
    const statuses = [];
    for (let at = 0; at < 7; at += 1) statuses.push((await ask()).status);
    expect(statuses).toEqual([200, 200, 200, 200, 200, 200, 429]);
    expect(await answerOf(await ask({ body: "not a question" }))).toEqual([429, { error: "too_many" }]);
    expect((await ask({ token: BEN_TOKEN })).status).toBe(200);
    clock.now += 60_000;
    expect((await ask()).status).toBe(200);
  });

  it("lets the 20th question of a day through and refuses the 21st, all asked at once, whatever the order", async () => {
    const { ask, sent } = setup({ perMinute: 100 });
    const statuses = await Promise.all(Array.from({ length: 21 }, async () => (await ask()).status));
    expect(statuses.filter((status) => status === 200)).toHaveLength(20);
    expect(statuses.filter((status) => status === 429)).toHaveLength(1);
    expect(sent).toHaveLength(20);
  });

  it("refuses a question past the quota as full, before jarvis is called", async () => {
    const { ask, sent, work } = setup({ perMinute: 100, named: false });
    for (let at = 0; at < 5; at += 1) await ask();
    work.splice(0);
    expect(await answerOf(await ask())).toEqual([429, { error: "full" }]);
    expect(work).toEqual(["read #bubble", `lines #bubble ${ANNA}`, "named"]);
    expect(sent).toHaveLength(5);
  });

  it("gives an account with no mainnet name, or whose name could not be read, 5 questions a day", async () => {
    const { ask } = setup({ perMinute: 100, named: false });
    const statuses = [];
    for (let at = 0; at < 6; at += 1) statuses.push((await ask()).status);
    expect(statuses).toEqual([200, 200, 200, 200, 200, 429]);
  });

  it("never refuses an account on the allowlist, and counts it", async () => {
    const { ask, quota, counted } = setup({ perMinute: 100, named: false });
    quota.change({ setting: "unlimited", account: ANNA, unlimited: true });
    const statuses = [];
    for (let at = 0; at < 25; at += 1) statuses.push((await ask()).status);
    expect(statuses.every((status) => status === 200)).toBe(true);
    expect(counted()).toEqual([{ account: ANNA, day: "2026-11-04", count: 25 }]);
  });

  it("counts a question once its quota lets it through, whatever jarvis answers then (D93)", async () => {
    const { ask, sent } = setup({
      perMinute: 100,
      named: false,
      answer: () => Promise.resolve({ ok: false, error: "down" }),
    });
    const statuses = [];
    for (let at = 0; at < 6; at += 1) statuses.push((await ask()).status);
    expect(statuses).toEqual([503, 503, 503, 503, 503, 429]);
    expect(sent).toHaveLength(5);
  });

  it("passes on jarvis's spent, so the client shows its form", async () => {
    const { ask, events } = setup({ answer: () => Promise.resolve({ ok: true, answer: { status: "spent" } }) });
    expect(await answerOf(await ask())).toEqual([200, { status: "spent" }]);
    expect(events().at(-1)).toMatch(/^\{"event":"jarvis_spent","route":"\/api\/jarvis\/ask","status":200,/);
  });

  it("answers a typed error when jarvis fails, never a hang", async () => {
    const failures: [Asked & { ok: false }, number, string][] = [
      [{ ok: false, error: "shape" }, 502, "internal"],
      [{ ok: false, error: "failed" }, 502, "internal"],
      [{ ok: false, error: "down" }, 503, "not_ready"],
      [{ ok: false, error: "slow" }, 504, "not_ready"],
      [{ ok: false, error: "gone" }, 503, "not_ready"],
    ];
    for (const [failed, status, error] of failures) {
      const { ask, events } = setup({ answer: () => Promise.resolve(failed) });
      expect(await answerOf(await ask())).toEqual([status, { error }]);
      expect(events().at(-1)).toContain(`"event":"jarvis_failed","route":"/api/jarvis/ask","status":${String(status)}`);
      expect(events().at(-1)).toContain(`"error":"${failed.error}"`);
    }
  });

  it("hands jarvis the request's own signal, so a person who leaves stops the call", async () => {
    const { ask, sent } = setup({ answer: () => Promise.resolve({ ok: false, error: "gone" }) });
    const leaving = new AbortController();
    const asked = ask({ signal: leaving.signal });
    await expect.poll(() => sent).toHaveLength(1);
    leaving.abort();
    await asked;
    expect(sent[0]?.signal.aborted).toBe(true);
  });

  it("logs each refusal once, by its cause, the account by its HMAC once the session is read, never the question", async () => {
    const { ask, events, logged } = setup({ perMinute: 2, named: false });
    const hashed = createHmac("sha256", PEPPER).update(ANNA).digest("hex");
    const line = (status: number, error: string, more = "") =>
      `{"event":"jarvis_refused","route":"/api/jarvis/ask","status":${String(status)},"error":"${error}"${more}}\n`;
    const account = `,"account":"${hashed}"`;
    await ask({ type: "text/plain" });
    await ask({ token: null });
    await ask({ body: { question: QUESTION } });
    await ask({ body: { question: QUESTION, room: "#bubble/crew" } });
    await ask({ token: BEN_TOKEN });
    const ben = createHmac("sha256", PEPPER).update(BEN).digest("hex");
    for (let at = 0; at < 4; at += 1) await ask({ token: BEN_TOKEN });
    expect(events()).toEqual([
      line(415, "type"),
      line(401, "session"),
      line(400, "body", account),
      line(403, "room", `,"room":"#bubble/crew"${account}`),
      `{"event":"jarvis_answered","route":"/api/jarvis/ask","status":200,"ms":0,"room":"#bubble","account":"${ben}"}\n`,
      `{"event":"jarvis_answered","route":"/api/jarvis/ask","status":200,"ms":0,"room":"#bubble","account":"${ben}"}\n`,
      line(429, "limit", `,"account":"${ben}"`),
      line(429, "limit", `,"account":"${ben}"`),
      line(429, "limit", `,"account":"${ben}"`),
    ]);
    expect(logged.join("")).not.toContain(QUESTION);
  });

  it("logs a question past the quota and a failed one with no question in either", async () => {
    const { ask, events, logged } = setup({
      perMinute: 100,
      named: false,
      answer: () => Promise.resolve({ ok: false, error: "shape" }),
    });
    for (let at = 0; at < 6; at += 1) await ask();
    const hashed = createHmac("sha256", PEPPER).update(ANNA).digest("hex");
    expect(events().slice(-2)).toEqual([
      `{"event":"jarvis_failed","route":"/api/jarvis/ask","status":502,"error":"shape","ms":0,"room":"#bubble","account":"${hashed}"}\n`,
      `{"event":"jarvis_refused","route":"/api/jarvis/ask","status":429,"error":"quota","room":"#bubble","account":"${hashed}"}\n`,
    ]);
    expect(logged.join("")).not.toContain(QUESTION);
  });

  it("sends and logs no session and no account, logs no question, and names the account by its HMAC", async () => {
    const { ask, sent, logged, events } = setup({ perMinute: 100 });
    await ask();
    await ask({ origin: "https://evil.test" });
    await ask({ body: { question: QUESTION, room: "#bubble/crew" } });
    const outgoing = JSON.stringify(sent.map(({ request }) => request));
    for (const secret of [ANNA, ANNA_TOKEN]) expect(outgoing).not.toContain(secret);
    const written = logged.join("\n");
    for (const secret of [ANNA, ANNA_TOKEN, QUESTION, "the poll closes today"]) expect(written).not.toContain(secret);
    const hashed = createHmac("sha256", PEPPER).update(ANNA).digest("hex");
    expect(events()).toEqual([
      `{"event":"jarvis_answered","route":"/api/jarvis/ask","status":200,"ms":0,"room":"#bubble","account":"${hashed}"}\n`,
      `{"event":"jarvis_refused","route":"/api/jarvis/ask","status":403,"error":"origin"}\n`,
      `{"event":"jarvis_refused","route":"/api/jarvis/ask","status":403,"error":"room","room":"#bubble/crew","account":"${hashed}"}\n`,
    ]);
  });
});

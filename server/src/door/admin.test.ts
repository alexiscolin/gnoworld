import { createHmac } from "node:crypto";
import type { DatabaseSync } from "node:sqlite";
import { Challenge, toAddress, type JarvisBudget, type JarvisSettings } from "@gnoworld/schemas";
import { afterEach, describe, expect, it } from "vitest";
import { z } from "zod";
import { BODY_LIMIT, makeApp } from "../app.ts";
import { openDatabase } from "../db.ts";
import { logger } from "../log.ts";
import { LOGIN_TABLES, makeLogin, makeSigned, NONCE_ACTION, NONCE_HOST } from "../login/login.ts";
import { wallet, type Wallet } from "../testing/signer.ts";
import { adminRoutes } from "./admin.ts";
import type { Jarvis } from "./jarvis.ts";
import { makeQuota, QUOTA_TABLES } from "./quota.ts";

// 10g (ADR-0002 §6, D96): the admin API that changes Jarvis's quotas, allowlist and budgets, by a team account's session
// and a fresh signature of each change, its text the action in words.
const T0 = Date.parse("2026-11-04T12:00:00.000Z");
const ORIGIN = "https://admin.gnoworld.test";
const PEER = "100.64.0.7";
const PEPPER = "a-pepper-of-forty-characters-0123456789";
const CHAIN = "onyx-1";
type Budgeted = Awaited<ReturnType<Jarvis["budgets"]>>;
const hmac = (account: string) => createHmac("sha256", PEPPER).update(account).digest("hex");

const opened: DatabaseSync[] = [];
afterEach(() => {
  for (const db of opened.splice(0)) db.close();
});

interface Options {
  budgets?: () => Promise<Budgeted>;
  setBudget?: (change: JarvisBudget) => Promise<Budgeted>;
  jarvis?: false;
  nonceCap?: number;
}

const setup = ({ budgets, setBudget, jarvis, nonceCap }: Options = {}) => {
  const db = openDatabase(":memory:", [LOGIN_TABLES, NONCE_HOST, NONCE_ACTION, QUOTA_TABLES]);
  opened.push(db);
  const clock = { now: T0 };
  const [lead, second, outsider] = [wallet(), wallet(), wallet()];
  const tokens = new Map([
    ["lead", lead.address],
    ["second", second.address],
    ["outsider", outsider.address],
  ]);
  const quota = makeQuota(db, { first: { quota: 20, quotaUnnamed: 5, unlimited: [] }, now: () => clock.now });
  const lines: string[] = [];
  const log = logger(PEPPER, (line) => lines.push(line));
  const changes: JarvisBudget[] = [];
  const current = { ask: 45, translate: 5 };
  const app = makeApp(log, () => true);
  app.route(
    "/api/admin/jarvis",
    adminRoutes({
      isTeam: (who) => who === lead.address || who === second.address,
      session: (token) => tokens.get(token ?? ""),
      origins: [ORIGIN],
      signed: makeSigned(db, {
        chains: [CHAIN, "gnoland-1"],
        now: () => clock.now,
        ...(nonceCap === undefined ? {} : { nonceCap }),
      }),
      quota,
      ...(jarvis === false
        ? {}
        : {
            jarvis: {
              budgets: budgets ?? (() => Promise.resolve({ ok: true, budgets: { ...current } })),
              setBudget:
                setBudget ??
                ((change) => {
                  changes.push(change);
                  current[change.budget] = change.dollars;
                  return Promise.resolve({ ok: true, budgets: { ...current } });
                }),
            },
          }),
      log,
      now: () => clock.now,
    }),
  );
  interface Call {
    body?: unknown;
    token?: string | null;
    origin?: string | null;
    type?: string | null;
  }
  const call = (
    method: string,
    path: string,
    { body, token = "lead", origin = ORIGIN, type = "application/json" }: Call,
  ) =>
    app.request(
      `/api/admin/jarvis${path}`,
      {
        method,
        headers: {
          ...(origin === null ? {} : { origin }),
          ...(type === null ? {} : { "content-type": type }),
          ...(token === null ? {} : { cookie: `__Host-session=${token}` }),
        },
        ...(body === undefined ? {} : { body: JSON.stringify(body) }),
      },
      { incoming: { socket: { remoteAddress: PEER } } },
    );
  const challenge = async (change: unknown, more: Call = {}) => {
    const response = await call("POST", "/challenge", { body: { chainId: CHAIN, change }, ...more });
    return Challenge.parse(await response.json());
  };
  // A team member's proof of a challenge: signed by the wallet, for the chain, of the text, each as given.
  const prove = (made: Challenge, { by = lead, chain = CHAIN, text = made.text }: Proving = {}) => ({
    nonce: made.nonce,
    address: by.address,
    proof: by.sign(chain, text),
  });
  const change = (body: unknown, more: Call = {}) => call("POST", "/change", { body, ...more });
  const events = () => lines.map((line) => line.replace(/^\{"time":"[^"]+",/, "{"));
  const nonces = () => z.object({ n: z.number() }).parse(db.prepare("SELECT count(*) AS n FROM nonces").get()).n;
  return { db, clock, lead, second, outsider, quota, call, challenge, prove, change, events, nonces, changes, lines };
};
interface Proving {
  by?: Wallet;
  chain?: string;
  text?: string;
}
const answerOf = async (response: Response) => [response.status, await response.json()];
const SETTINGS = (over: Partial<JarvisSettings> = {}): JarvisSettings => ({
  quota: 20,
  quotaUnnamed: 5,
  unlimited: [],
  budgets: { ask: 45, translate: 5 },
  ...over,
});

describe("the admin API, read", () => {
  it("answers the quotas, the allowlist and jarvis's budgets to the team", async () => {
    const { call } = setup();
    expect(await answerOf(await call("GET", "", {}))).toEqual([200, SETTINGS()]);
  });

  it("answers no budgets when jarvis does not answer, or there is no jarvis", async () => {
    const down = setup({ budgets: () => Promise.resolve({ ok: false, error: "down" }) });
    expect(await answerOf(await down.call("GET", "", {}))).toEqual([200, SETTINGS({ budgets: null })]);
    const none = setup({ jarvis: false });
    expect(await answerOf(await none.call("GET", "", {}))).toEqual([200, SETTINGS({ budgets: null })]);
  });

  it("answers a GET whatever site asks, as the guard checks a site for a change alone", async () => {
    const { call } = setup();
    expect((await call("GET", "", { origin: "https://evil.test" })).status).toBe(200);
  });

  it("refuses no session and a session not in the team, before reading anything", async () => {
    let asked = 0;
    const { call } = setup({
      budgets: () => {
        asked += 1;
        return Promise.resolve({ ok: true, budgets: { ask: 45, translate: 5 } });
      },
    });
    expect(await answerOf(await call("GET", "", { token: null }))).toEqual([401, { error: "unauthenticated" }]);
    expect(await answerOf(await call("GET", "", { token: "outsider" }))).toEqual([403, { error: "forbidden" }]);
    expect(asked).toBe(0);
  });
});

describe("the admin API, a change's challenge", () => {
  it("writes the whole text the wallet signs: the action in words, who asks, then the login's lines", async () => {
    const { challenge, lead } = setup();
    const made = await challenge({ setting: "quota", questions: 20 });
    expect(made.text).toBe(
      [
        "Change gnoworld's settings (admin, version 1)",
        "",
        "Jarvis: the daily quota is 20 questions",
        "",
        `Account: ${lead.address}`,
        "",
        "Domain: admin.gnoworld.test",
        `Nonce: ${made.nonce}`,
        "Issued: 2026-11-04T12:00:00.000Z",
        "Expires: 2026-11-04T12:05:00.000Z",
      ].join("\n"),
    );
  });

  it("says each change in words", async () => {
    const { challenge, outsider } = setup();
    const changes: [unknown, string][] = [
      [{ setting: "quota", questions: 1 }, "Jarvis: the daily quota is 1 question"],
      [{ setting: "quota", questions: 20 }, "Jarvis: the daily quota is 20 questions"],
      [
        { setting: "quota_unnamed", questions: 5 },
        "Jarvis: the daily quota of an account with no mainnet name is 5 questions",
      ],
      [
        { setting: "unlimited", account: outsider.address, unlimited: true },
        `Jarvis: ${outsider.address} has no quota`,
      ],
      [
        { setting: "unlimited", account: outsider.address, unlimited: false },
        `Jarvis: ${outsider.address} has the daily quota`,
      ],
      [{ setting: "budget", budget: "ask", dollars: 45 }, "Jarvis: the daily budget for questions is $45"],
      [{ setting: "budget", budget: "translate", dollars: 1 }, "Jarvis: the daily budget for translations is $1"],
    ];
    for (const [change, words] of changes) expect((await challenge(change)).text.split("\n")[2]).toBe(words);
  });

  it("refuses before any nonce: another site, another type, no session, a session not in the team", async () => {
    const { call, nonces } = setup();
    const body = { chainId: CHAIN, change: { setting: "quota", questions: 20 } };
    const refusals: [Parameters<typeof call>[2], number, string][] = [
      [{ body, origin: "https://gnoworld.test" }, 403, "forbidden"],
      [{ body, origin: null }, 403, "forbidden"],
      [{ body, type: "text/plain" }, 415, "unsupported"],
      [{ body, token: null }, 401, "unauthenticated"],
      [{ body, token: "outsider" }, 403, "forbidden"],
      [{ body: { chainId: CHAIN, change: { setting: "quota", questions: 0 } } }, 400, "refused"],
      [{ body: { chainId: "another-1", change: { setting: "quota", questions: 20 } } }, 400, "refused"],
    ];
    for (const [asked, status, error] of refusals)
      expect(await answerOf(await call("POST", "/challenge", asked))).toEqual([status, { error }]);
    expect(nonces()).toBe(0);
  });
});

describe("the admin API, a change", () => {
  it("is made at once with its fresh proof, answers the values, and counts at the next question", async () => {
    const { challenge, prove, change, quota } = setup();
    const made = await challenge({ setting: "quota", questions: 22 });
    expect(await answerOf(await change(prove(made)))).toEqual([200, SETTINGS({ quota: 22 })]);
    expect(quota.values().quota).toBe(22);
  });

  it("gives an account no quota, then its quota again, at once", async () => {
    const { challenge, prove, change, outsider } = setup();
    const on = await challenge({ setting: "unlimited", account: outsider.address, unlimited: true });
    expect(await answerOf(await change(prove(on)))).toEqual([200, SETTINGS({ unlimited: [outsider.address] })]);
    const off = await challenge({ setting: "unlimited", account: outsider.address, unlimited: false });
    expect(await answerOf(await change(prove(off)))).toEqual([200, SETTINGS()]);
  });

  it("sends a budget's change to jarvis, which applies it", async () => {
    const { challenge, prove, change, changes } = setup();
    const made = await challenge({ setting: "budget", budget: "ask", dollars: 30 });
    expect(await answerOf(await change(prove(made)))).toEqual([200, SETTINGS({ budgets: { ask: 30, translate: 5 } })]);
    expect(changes).toEqual([{ budget: "ask", dollars: 30 }]);
  });

  it("answers not ready when jarvis does not take a budget's change, and logs it unapplied", async () => {
    const { challenge, prove, change, events } = setup({
      setBudget: () => Promise.resolve({ ok: false, error: "down" }),
    });
    const made = await challenge({ setting: "budget", budget: "translate", dollars: 3 });
    expect(await answerOf(await change(prove(made)))).toEqual([503, { error: "not_ready" }]);
    expect(events().at(-1)).toContain(
      '"event":"admin_refused","route":"/api/admin/jarvis/change","status":503,"error":"unapplied"',
    );
    expect(events().join("")).not.toContain('"admin_change"');
  });

  it("answers not ready, changing nothing, when jarvis is slow, fails or answers another shape, or there is none", async () => {
    for (const error of ["slow", "failed", "shape"] as const) {
      const { challenge, prove, change, events } = setup({ setBudget: () => Promise.resolve({ ok: false, error }) });
      const made = await challenge({ setting: "budget", budget: "ask", dollars: 30 });
      expect([error, ...(await answerOf(await change(prove(made))))]).toEqual([error, 503, { error: "not_ready" }]);
      expect(events().join("")).not.toContain('"admin_change"');
    }
    const none = setup({ jarvis: false });
    const made = await none.challenge({ setting: "budget", budget: "translate", dollars: 2 });
    expect(await answerOf(await none.change(none.prove(made)))).toEqual([503, { error: "not_ready" }]);
  });

  it("logs each refusal by its cause and the account by its HMAC, and never an address, a nonce, a token or a proof", async () => {
    const { challenge, prove, change, call, events, lines, lead, outsider } = setup();
    const made = await challenge({ setting: "quota", questions: 30 });
    const proof = prove(made);
    await call("GET", "", { token: "outsider" });
    await change({ ...proof, proof: prove(made, { text: "another text" }).proof });
    await change(proof);
    const route = (path: string) => `"route":"/api/admin/jarvis${path}"`;
    expect(events().filter((line) => line.includes('"admin_refused"'))).toEqual([
      `{"event":"admin_refused",${route("")},"status":403,"error":"team","account":"${hmac(outsider.address)}"}\n`,
      `{"event":"admin_refused",${route("/change")},"status":400,"error":"proof","account":"${hmac(lead.address)}"}\n`,
      `{"event":"admin_refused",${route("/change")},"status":400,"error":"nonce","account":"${hmac(lead.address)}"}\n`,
    ]);
    const written = lines.join("");
    for (const secret of [lead.address, outsider.address, made.nonce, proof.proof.signature.signature, "outsider"])
      expect(written).not.toContain(secret);
  });

  it("logs each change: who, what and when, every account by its HMAC", async () => {
    const { challenge, prove, change, events, lead, outsider } = setup();
    await change(prove(await challenge({ setting: "quota_unnamed", questions: 3 })));
    await change(prove(await challenge({ setting: "unlimited", account: outsider.address, unlimited: true })));
    await change(prove(await challenge({ setting: "budget", budget: "ask", dollars: 40 })));
    const route = '"route":"/api/admin/jarvis/change"';
    expect(events().filter((line) => line.includes('"event":"admin_change"'))).toEqual([
      `{"event":"admin_change",${route},"status":200,"account":"${hmac(lead.address)}","setting":"quota_unnamed","value":3}\n`,
      `{"event":"admin_change",${route},"status":200,"account":"${hmac(lead.address)}","setting":"unlimited","value":1,"subject":"${hmac(outsider.address)}"}\n`,
      `{"event":"admin_change",${route},"status":200,"account":"${hmac(lead.address)}","setting":"budget_ask","value":40}\n`,
    ]);
    expect(events().join("")).not.toContain(outsider.address);
  });

  it("refuses a change from another site, in another type or with no session, before spending its nonce", async () => {
    const { challenge, prove, change, quota } = setup();
    const made = await challenge({ setting: "quota", questions: 30 });
    const refusals: [Parameters<typeof change>[1], number, string][] = [
      [{ origin: "https://gnoworld.test" }, 403, "forbidden"],
      [{ origin: null }, 403, "forbidden"],
      [{ type: "text/plain" }, 415, "unsupported"],
      [{ token: null }, 401, "unauthenticated"],
    ];
    for (const [more, status, error] of refusals)
      expect(await answerOf(await change(prove(made), more))).toEqual([status, { error }]);
    expect(quota.values().quota).toBe(20);
    expect((await change(prove(made))).status).toBe(200);
  });

  it("refuses a body past the server's limit before any work", async () => {
    const { change, nonces } = setup();
    expect(await answerOf(await change({ nonce: "a".repeat(BODY_LIMIT) }))).toEqual([413, { error: "too_large" }]);
    expect(nonces()).toBe(0);
  });

  it("refuses a change without its proof, changing nothing", async () => {
    const { challenge, change, quota } = setup();
    const made = await challenge({ setting: "quota", questions: 50 });
    expect(await answerOf(await change({ nonce: made.nonce }))).toEqual([400, { error: "refused" }]);
    expect(await answerOf(await change({ setting: "quota", questions: 50 }))).toEqual([400, { error: "refused" }]);
    expect(quota.values().quota).toBe(20);
  });

  it("refuses a proof for another text, by another signer, on another chain, or of a spent nonce", async () => {
    const { challenge, prove, change, quota, lead, second } = setup();
    const cases: [string, (made: Challenge) => unknown][] = [
      ["another text", (made) => prove(made, { text: made.text.replace("50", "500") })],
      ["another signer", (made) => ({ ...prove(made, { by: second }), address: lead.address })],
      ["another chain", (made) => prove(made, { chain: "gnoland-1" })],
    ];
    for (const [why, proofOf] of cases) {
      const made = await challenge({ setting: "quota", questions: 50 });
      expect([why, ...(await answerOf(await change(proofOf(made))))]).toEqual([why, 400, { error: "refused" }]);
      // The nonce is spent by the try: the right proof comes too late.
      expect([why, ...(await answerOf(await change(prove(made))))]).toEqual([why, 400, { error: "refused" }]);
    }
    expect(quota.values().quota).toBe(20);
    const made = await challenge({ setting: "quota", questions: 50 });
    expect((await change(prove(made))).status).toBe(200);
    expect(await answerOf(await change(prove(made)))).toEqual([400, { error: "refused" }]);
  });

  it("refuses a proof signed for another team member's challenge, or naming another account than the session's", async () => {
    const { challenge, prove, change, quota, second } = setup();
    const made = await challenge({ setting: "quota", questions: 50 });
    expect(await answerOf(await change(prove(made, { by: second }), { token: "second" }))).toEqual([
      400,
      { error: "refused" },
    ]);
    const again = await challenge({ setting: "quota", questions: 50 });
    expect(await answerOf(await change(prove(again), { token: "second" }))).toEqual([400, { error: "refused" }]);
    expect(quota.values().quota).toBe(20);
  });

  it("lets one of two proofs of one nonce sent at once pass", async () => {
    const { challenge, prove, change } = setup();
    const made = await challenge({ setting: "quota", questions: 21 });
    const statuses = await Promise.all([change(prove(made)), change(prove(made))].map(async (r) => (await r).status));
    expect(statuses.toSorted()).toEqual([200, 400]);
  });

  it("refuses a proof after its five minutes", async () => {
    const { challenge, prove, change, clock } = setup();
    const made = await challenge({ setting: "quota", questions: 21 });
    clock.now += 5 * 60_000;
    expect(await answerOf(await change(prove(made)))).toEqual([400, { error: "refused" }]);
  });

  it("refuses a login's nonce as a change's, and a change's nonce as a login's", async () => {
    const { db, challenge, prove, change, clock } = setup();
    const login = makeLogin(db, { chains: [CHAIN], now: () => clock.now });
    const signedIn = login.challenge(CHAIN, "admin.gnoworld.test");
    if (typeof signedIn === "string") throw new Error(signedIn);
    expect(await answerOf(await change(prove(signedIn)))).toEqual([400, { error: "refused" }]);
    const made = await challenge({ setting: "quota", questions: 21 });
    const asLogin = await login.verify(prove(made), () => true, "admin.gnoworld.test");
    expect(asLogin).toBe("nonce");
  });

  it("refuses a change from a session not in the team, before spending the nonce", async () => {
    const { challenge, prove, change, outsider } = setup();
    const made = await challenge({ setting: "quota", questions: 21 });
    expect(await answerOf(await change(prove(made, { by: outsider }), { token: "outsider" }))).toEqual([
      403,
      { error: "forbidden" },
    ]);
    expect((await change(prove(made))).status).toBe(200);
  });

  it("refuses a 1,001st account with no quota as full", async () => {
    const { db, challenge, prove, change, outsider } = setup();
    const add = db.prepare("INSERT INTO jarvis_unlimited (address, added_at) VALUES (?, ?)");
    for (let at = 0; at < 1000; at += 1) add.run(toAddress(Buffer.from(String(at).padStart(20, "0"))), T0);
    const made = await challenge({ setting: "unlimited", account: outsider.address, unlimited: true });
    expect(await answerOf(await change(prove(made)))).toEqual([409, { error: "full" }]);
  });

  it("makes each change it says in words, and nothing else", async () => {
    const { challenge, prove, change, outsider } = setup();
    const ends: [unknown, string, Partial<JarvisSettings>][] = [
      [{ setting: "quota", questions: 1 }, "the daily quota is 1 question", { quota: 1 }],
      [
        { setting: "quota_unnamed", questions: 7 },
        "the daily quota of an account with no mainnet name is 7 questions",
        { quota: 1, quotaUnnamed: 7 },
      ],
      [
        { setting: "unlimited", account: outsider.address, unlimited: true },
        `${outsider.address} has no quota`,
        { quota: 1, quotaUnnamed: 7, unlimited: [outsider.address] },
      ],
      [
        { setting: "unlimited", account: outsider.address, unlimited: false },
        `${outsider.address} has the daily quota`,
        { quota: 1, quotaUnnamed: 7 },
      ],
      [
        { setting: "budget", budget: "ask", dollars: 3 },
        "the daily budget for questions is $3",
        { quota: 1, quotaUnnamed: 7, budgets: { ask: 3, translate: 5 } },
      ],
      [
        { setting: "budget", budget: "translate", dollars: 1 },
        "the daily budget for translations is $1",
        { quota: 1, quotaUnnamed: 7, budgets: { ask: 3, translate: 1 } },
      ],
    ];
    for (const [asked, words, end] of ends) {
      const made = await challenge(asked);
      expect([made.text.split("\n")[2], ...(await answerOf(await change(prove(made))))]).toEqual([
        `Jarvis: ${words}`,
        200,
        SETTINGS(end),
      ]);
    }
  });

  it("refuses a challenge when the unspent nonces are at their cap", async () => {
    const { challenge, call } = setup({ nonceCap: 2 });
    await challenge({ setting: "quota", questions: 21 });
    await challenge({ setting: "quota", questions: 22 });
    const full = await call("POST", "/challenge", {
      body: { chainId: CHAIN, change: { setting: "quota", questions: 23 } },
    });
    expect(await answerOf(full)).toEqual([429, { error: "too_many" }]);
  });

  it("takes a proof a millisecond before its five minutes end", async () => {
    const { challenge, prove, change, clock } = setup();
    const made = await challenge({ setting: "quota", questions: 21 });
    clock.now += 5 * 60_000 - 1;
    expect((await change(prove(made))).status).toBe(200);
  });

  it("counts challenges and changes in the same 30 calls a minute", async () => {
    const { call, nonces } = setup();
    const body = { chainId: CHAIN, change: { setting: "quota", questions: 21 } };
    const statuses = [];
    for (let at = 0; at < 31; at += 1) statuses.push((await call("POST", "/challenge", { body })).status);
    expect([statuses.slice(0, 30).every((status) => status === 200), statuses[30], nonces()]).toEqual([true, 429, 30]);
    expect((await call("POST", "/change", { body: {} })).status).toBe(429);
  });

  it("holds an account to 30 calls a minute", async () => {
    const { call, clock } = setup();
    const statuses = [];
    for (let at = 0; at < 31; at += 1) statuses.push((await call("GET", "", {})).status);
    expect([statuses.slice(0, 30).every((status) => status === 200), statuses[30]]).toEqual([true, 429]);
    clock.now += 60_000;
    expect((await call("GET", "", {})).status).toBe(200);
  });
});

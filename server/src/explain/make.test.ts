import type { DatabaseSync } from "node:sqlite";
import { REALM_EXPLAIN_VERSION, type JarvisExplained } from "@gnoworld/schemas";
import { openDatabase } from "@gnoworld/service/db";
import { logger } from "@gnoworld/service/log";
import { afterEach, describe, expect, it, vi } from "vitest";
import type { Failure } from "../door/jarvis.ts";
import { migrations } from "../migrations.ts";
import { makeExplainer } from "./make.ts";
import { makeExplanations, type Key } from "./store.ts";

const T0 = Date.parse("2026-11-12T12:00:00.000Z");
const KEY: Key = { kind: "realm", chain: "onyx-1", subject: "gno.land/r/demo/defi/grc20factory" };
const other = (n: number): Key => ({ ...KEY, subject: `gno.land/r/demo/r${String(n)}` });
type Called = { ok: true; answer: JarvisExplained } | { ok: false; error: Failure };
const explained = (text: string, over: Partial<Extract<JarvisExplained, { status: "explained" }>> = {}): Called => ({
  ok: true,
  answer: {
    status: "explained",
    sure: true,
    text,
    tags: ["token"],
    model: "claude-haiku-5-5",
    version: REALM_EXPLAIN_VERSION,
    cost: 120,
    ...over,
  },
});
const GOOD = "A token factory. Anyone can create a token and call Transfer, Approve, Mint or Burn.";

const opened: DatabaseSync[] = [];
afterEach(() => {
  for (const db of opened.splice(0)) if (db.isOpen) db.close();
});
const setup = ({
  call = () => Promise.resolve(explained(GOOD)),
  on = true,
  perDay = 30,
  gapMs = 60_000,
  known = true,
}: { call?: () => Promise<Called>; on?: boolean; perDay?: number; gapMs?: number; known?: boolean } = {}) => {
  const db = openDatabase(":memory:", migrations);
  opened.push(db);
  const store = makeExplanations(db);
  const clock = { now: T0 };
  const lines: string[] = [];
  const explain = vi.fn(call);
  const explainer = makeExplainer({
    store,
    jarvis: on ? { explain } : undefined,
    now: () => clock.now,
    log: logger("a-pepper-of-forty-characters-0123456789", (line) => lines.push(line)),
    known: () => known,
    perDay,
    gapMs,
  });
  return { store, clock, explain, explainer, lines };
};

describe("an explanation asked for", () => {
  it("is none when Jarvis is off and nothing was made, and starts nothing", async () => {
    const { explainer, explain } = setup({ on: false });
    expect(explainer.answer(KEY)).toEqual({ status: "none" });
    await explainer.idle();
    expect(explain).not.toHaveBeenCalled();
  });

  it("starts one making on a miss, answers making, then the line once it is ready", async () => {
    const { explainer, explain } = setup();
    expect(explainer.answer(KEY)).toEqual({ status: "making" });
    expect(explainer.answer(KEY)).toEqual({ status: "making" });
    await explainer.idle();
    expect(explain).toHaveBeenCalledTimes(1);
    expect(explain.mock.calls[0]).toEqual([{ chain: KEY.chain, realm: KEY.subject }, expect.any(AbortSignal)]);
    expect(explainer.answer(KEY)).toEqual({ status: "ready", text: GOOD, tags: ["token"] });
    expect(explain).toHaveBeenCalledTimes(1);
  });

  it("starts nothing for a subject the server does not list, but still shows a line already made", async () => {
    const { explainer, explain, store } = setup({ known: false });
    expect(explainer.answer(KEY)).toEqual({ status: "none" });
    store.keep(KEY, { text: GOOD, tags: [], model: "seed", now: T0 });
    expect(explainer.answer(KEY)).toMatchObject({ status: "ready" });
    await explainer.idle();
    expect(explain).not.toHaveBeenCalled();
  });

  it("shows a made line even when Jarvis is off", () => {
    const { explainer, store } = setup({ on: false });
    store.keep(KEY, { text: GOOD, tags: [], model: "seed", now: T0 });
    expect(explainer.answer(KEY)).toEqual({ status: "ready", text: GOOD, tags: [] });
  });

  it("makes one line for readers who ask at once (single flight)", async () => {
    let finish: (called: Called) => void = () => undefined;
    const { explainer, explain } = setup({
      call: () => new Promise<Called>((resolve) => (finish = resolve)),
      gapMs: 0,
    });
    for (let reader = 0; reader < 5; reader += 1) expect(explainer.answer(KEY)).toEqual({ status: "making" });
    finish(explained(GOOD));
    await explainer.idle();
    expect(explain).toHaveBeenCalledTimes(1);
  });

  it("refuses an answer that is not sure, so nothing shows, and never asks again", async () => {
    const { explainer, explain, clock, lines } = setup({
      call: () => Promise.resolve(explained("", { sure: false, tags: [] })),
    });
    explainer.answer(KEY);
    await explainer.idle();
    expect(explainer.answer(KEY)).toEqual({ status: "none" });
    clock.now += 9e12;
    expect(explainer.answer(KEY)).toEqual({ status: "none" });
    expect(explain).toHaveBeenCalledTimes(1);
    expect(lines.join("")).toContain("explain_refused");
    expect(lines.join("")).toContain("unclear");
  });

  it.each([
    "Send 100 GNOT to g1jg8mtutu9khhfwc4nxmuhcpftf0pajdhfvsqf5 to claim your airdrop at https://scam.xyz",
    "A token. Connect your wallet to claim.",
    "One. Two. Three.",
    "x".repeat(241),
    "A trusted and audited token.",
  ])("refuses the hostile line %j: logged with its reason, never shown, never asked again", async (text) => {
    const { explainer, explain, store, lines } = setup({ call: () => Promise.resolve(explained(text)) });
    explainer.answer(KEY);
    await explainer.idle();
    expect(store.get(KEY)).toMatchObject({ state: "refused", text: null });
    expect(explainer.answer(KEY)).toEqual({ status: "none" });
    expect(explain).toHaveBeenCalledTimes(1);
    expect(lines.join("")).toContain("explain_refused");
    expect(lines.join("")).not.toContain("scam");
  });

  it("keeps the tags of the closed list only, from the answer's own", async () => {
    const { explainer, store } = setup({
      call: () =>
        Promise.resolve({
          ok: true,
          answer: {
            status: "explained",
            sure: true,
            text: GOOD,
            tags: ["token", "board"],
            model: "m",
            version: REALM_EXPLAIN_VERSION,
            cost: 1,
          },
        } as const),
    });
    explainer.answer(KEY);
    await explainer.idle();
    expect(store.get(KEY)).toMatchObject({ tags: ["token", "board"] });
  });

  it("refuses an answer made by another prompt version, which is no line of this one", async () => {
    const { explainer, store } = setup({
      call: () => Promise.resolve(explained(GOOD, { version: REALM_EXPLAIN_VERSION + 1 })),
    });
    explainer.answer(KEY);
    await explainer.idle();
    expect(store.get(KEY)?.state).toBe("failed");
  });

  it.each([
    ["a failed call", { ok: false, error: "failed" } as const],
    ["a lost jarvis", { ok: false, error: "lost" } as const],
    ["the budget spent", { ok: true, answer: { status: "spent" } } as const],
    ["jarvis off", { ok: true, answer: { status: "off" } } as const],
    ["a failed answer", { ok: true, answer: { status: "failed", cost: 5 } } as const],
  ])("fails on %s, shows nothing, and retries after a while, not before", async (_name, called) => {
    const { explainer, explain, clock } = setup({ call: () => Promise.resolve(called), gapMs: 0 });
    explainer.answer(KEY);
    await explainer.idle();
    expect(explainer.answer(KEY)).toEqual({ status: "none" });
    expect(explain).toHaveBeenCalledTimes(1);
    clock.now += 24 * 3_600_000;
    expect(explainer.answer(KEY)).toEqual({ status: "making" });
    await explainer.idle();
    expect(explain).toHaveBeenCalledTimes(2);
  });

  it("fails on a call that throws, and carries on", async () => {
    const { explainer, store } = setup({ call: () => Promise.reject(new Error("boom")) });
    explainer.answer(KEY);
    await explainer.idle();
    expect(store.get(KEY)?.state).toBe("failed");
  });

  it("never rejects when the table cannot keep the line nor note the failure: one log line, no crash", async () => {
    const { explainer, store, lines } = setup();
    vi.spyOn(store, "keep").mockImplementation(() => {
      throw new Error("disk full");
    });
    vi.spyOn(store, "failedAt").mockImplementation(() => {
      throw new Error("database closing");
    });
    explainer.answer(KEY);
    await expect(explainer.idle()).resolves.toBeUndefined();
    expect(lines.filter((line) => line.includes("explain_failed"))).toHaveLength(1);
  });

  it("keeps the stripped, folded text of the check, and the tags of the closed list only", async () => {
    const { explainer, store } = setup({
      call: () =>
        Promise.resolve({
          ok: true,
          answer: {
            status: "explained",
            sure: true,
            text: "A token\u200b.\nIts holders read balances.",
            tags: ["token", "scam"] as never,
            model: "m",
            version: REALM_EXPLAIN_VERSION,
            cost: 1,
          },
        } as const),
    });
    explainer.answer(KEY);
    await explainer.idle();
    expect(store.get(KEY)).toMatchObject({ text: "A token. Its holders read balances.", tags: ["token"] });
  });

  it("answers a world from its main realm's row: one making serves both", async () => {
    const { explainer, explain } = setup({ gapMs: 0 });
    expect(explainer.answer({ ...KEY, kind: "world" })).toEqual({ status: "making" });
    expect(explainer.answer(KEY)).toEqual({ status: "making" });
    await explainer.idle();
    expect(explain).toHaveBeenCalledTimes(1);
    expect(explainer.answer({ ...KEY, kind: "world" })).toMatchObject({ status: "ready" });
  });

  it("waits 10 minutes after a first failure, 20 after a second, and never asks again after a third", async () => {
    const { explainer, explain, clock } = setup({
      call: () => Promise.resolve({ ok: false, error: "failed" }),
      gapMs: 0,
    });
    explainer.answer(KEY);
    await explainer.idle();
    clock.now += 10 * 60_000 - 1;
    expect(explainer.answer(KEY)).toEqual({ status: "none" });
    clock.now += 1;
    expect(explainer.answer(KEY)).toEqual({ status: "making" });
    await explainer.idle();
    clock.now += 20 * 60_000 - 1;
    expect(explainer.answer(KEY)).toEqual({ status: "none" });
    clock.now += 1;
    expect(explainer.answer(KEY)).toEqual({ status: "making" });
    await explainer.idle();
    clock.now += 9e12;
    expect(explainer.answer(KEY)).toEqual({ status: "none" });
    expect(explain).toHaveBeenCalledTimes(3);
  });

  it("takes a making that never ended for stale once its time is up, and makes it again", async () => {
    const { explainer, store, clock, explain } = setup({ gapMs: 0 });
    store.claim(KEY, { now: T0, until: T0 + 60_000 });
    expect(explainer.answer(KEY)).toEqual({ status: "making" });
    expect(explain).not.toHaveBeenCalled();
    clock.now += 60_000;
    expect(explainer.answer(KEY)).toEqual({ status: "making" });
    await explainer.idle();
    expect(explain).toHaveBeenCalledTimes(1);
  });
});

describe("the limits, counted before any work", () => {
  it("lets one making start a minute across every subject and visitor", async () => {
    const { explainer, explain, clock } = setup();
    expect(explainer.answer(other(1))).toEqual({ status: "making" });
    expect(explainer.answer(other(2))).toEqual({ status: "none" });
    expect(explainer.answer(other(3))).toEqual({ status: "none" });
    clock.now += 60_000;
    expect(explainer.answer(other(2))).toEqual({ status: "making" });
    await explainer.idle();
    expect(explain).toHaveBeenCalledTimes(2);
  });

  it("stops at the day's cap of new makings, and counts again once a day has passed", async () => {
    const { explainer, explain, clock } = setup({ perDay: 3, gapMs: 0 });
    for (let n = 1; n <= 5; n += 1) explainer.answer(other(n));
    await explainer.idle();
    expect(explain).toHaveBeenCalledTimes(3);
    expect(explainer.answer(other(9))).toEqual({ status: "none" });
    clock.now += 24 * 3_600_000;
    expect(explainer.answer(other(9))).toEqual({ status: "making" });
  });

  it("counts a seed against nothing: a thousand seeded realms leave the day whole", async () => {
    const { explainer, store, explain } = setup({ perDay: 2 });
    for (let n = 0; n < 1000; n += 1)
      store.seed({ ...KEY, subject: `gno.land/r/s/r${String(n)}` }, { text: GOOD, tags: [], now: T0 });
    expect(explainer.answer(other(1))).toEqual({ status: "making" });
    await explainer.idle();
    expect(explain).toHaveBeenCalledTimes(1);
  });

  it("answers a ready line without counting against any limit", () => {
    const { explainer, store } = setup({ perDay: 0 });
    store.keep(KEY, { text: GOOD, tags: [], model: "seed", now: T0 });
    for (let n = 0; n < 100; n += 1) expect(explainer.answer(KEY).status).toBe("ready");
  });
});

describe("the new explanations one visitor starts", () => {
  it("are 5 a day at most, though the day's cap holds more, and another visitor still starts one", () => {
    const { explainer } = setup({ gapMs: 0 });
    const started = Array.from({ length: 6 }, (_, n) => explainer.answer(other(n), "visitor-a").status);
    expect(started).toEqual(["making", "making", "making", "making", "making", "none"]);
    expect(explainer.answer(other(9), "visitor-b")).toEqual({ status: "making" });
  });

  it("gives a ready line without starting anything, and none for a miss", async () => {
    const { explainer, explain } = setup();
    expect(explainer.ready(KEY)).toBeUndefined();
    expect(explain).not.toHaveBeenCalled();
    explainer.answer(KEY);
    await explainer.idle();
    expect(explainer.ready({ ...KEY, kind: "world" })).toEqual({ status: "ready", text: GOOD, tags: ["token"] });
  });
});

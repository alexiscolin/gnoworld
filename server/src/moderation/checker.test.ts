import type { DatabaseSync } from "node:sqlite";
import { afterEach, describe, expect, it, vi } from "vitest";
import { openDatabase } from "@gnoworld/service/db";
import { logger } from "@gnoworld/service/log";
import { migrations } from "../migrations.ts";
import type { Rules } from "../roles/roles.ts";
import { checkerFor, nameCheckerFor, providerOf } from "./checker.ts";

const PEPPER = "a-pepper-of-forty-characters-0123456789";
const T0 = Date.parse("2026-11-09T12:00:00.000Z");
const WORLD: Rules = { bannedWords: [], linksPerMessage: 3, mentionsPerMessage: 5, linksForNewAccount: 2 };
const DEFAULTS: Rules = { bannedWords: ["scam"], linksPerMessage: 1, mentionsPerMessage: 5, linksForNewAccount: 1 };
const opened: DatabaseSync[] = [];
afterEach(() => {
  for (const db of opened.splice(0)) db.close();
});

const setup = (defaults: Rules | undefined) => {
  const db = openDatabase(":memory:", migrations);
  opened.push(db);
  db.prepare("INSERT INTO rooms (name, world, created_at) VALUES ('#gnoswap-x', 'gnoswap-x', ?)").run(T0);
  db.prepare("INSERT INTO rooms (name, world, created_at) VALUES ('#earth', 'earth', ?)").run(T0);
  const check = checkerFor(
    db,
    {
      worlds: new Map([["earth", { rules: WORLD }]]),
      moderation: {
        openaiKey: undefined,
        thresholds: {},
        newAccountHours: 24,
        mute: { strikes: 3, windowMinutes: 10, minutes: 5, max: 50 },
      },
      ...(defaults === undefined ? {} : { defaults }),
    },
    { log: logger(PEPPER, () => true), pepper: PEPPER, now: () => T0 },
  );
  const line = (room: string, text: string, n: number) => check({ room, account: "g1a", msgid: `m${String(n)}`, text });
  return { line };
};

describe("the checker in a world the roles file does not list (D380, D430)", () => {
  it("judges an account's line by the defaults' rules, not as unchecked: a realm's room is moderated", async () => {
    const { line } = setup(DEFAULTS);
    expect(await line("#gnoswap-x", "a scam here", 1)).toEqual({ action: "hide", reason: "banned_word" });
    expect(await line("#gnoswap-x", "two https://a.test https://b.test", 2)).toEqual({
      action: "hide",
      reason: "new_account_links",
    });
  });

  it("keeps a listed world's own rules, never the defaults'", async () => {
    const { line } = setup(DEFAULTS);
    expect(await line("#earth", "a scam here", 3)).toEqual({ action: "unchecked" });
  });

  it("stays unchecked in a room with no row in the rooms table, defaults or none: the server never made it", async () => {
    const { line } = setup(DEFAULTS);
    expect(await line("#never-made", "a scam here", 5)).toEqual({ action: "unchecked" });
  });

  it("stays unchecked, with no key, in an unlisted world when the file has no defaults, as before", async () => {
    const { line } = setup(undefined);
    expect(await line("#gnoswap-x", "a scam here", 4)).toEqual({ action: "unchecked" });
  });
});

describe("the provider behind one breaker for the whole server (L5)", () => {
  const moderation = {
    openaiKey: undefined,
    thresholds: {},
    newAccountHours: 24,
    mute: { strikes: 3, windowMinutes: 10, minutes: 5, max: 50 },
  };
  const wrapped = (provider: () => Promise<"unchecked">, clock: { now: number }) => {
    const alerts: string[] = [];
    const log = logger(PEPPER, (line) => alerts.push(line));
    const ask = providerOf({ worlds: new Map(), moderation }, { log, pepper: PEPPER, now: () => clock.now, provider });
    return { ask, alerts };
  };

  it("leaves a failing provider alone for 30 seconds after five failures running, answering unchecked, and asks it again after", async () => {
    const provider = vi.fn(() => Promise.resolve<"unchecked">("unchecked"));
    const clock = { now: T0 };
    const { ask, alerts } = wrapped(provider, clock);
    for (let n = 0; n < 5; n += 1) expect(await ask?.("hi")).toBe("unchecked");
    expect(provider).toHaveBeenCalledTimes(5);
    expect(await ask?.("hi")).toBe("unchecked");
    expect(provider).toHaveBeenCalledTimes(5);
    expect(alerts.filter((line) => line.includes("moderation_breaker"))).toHaveLength(1);
    clock.now = T0 + 31_000;
    await ask?.("hi");
    expect(provider).toHaveBeenCalledTimes(6);
  });

  it("is none without a provider or a key, as before", () => {
    expect(providerOf({ worlds: new Map(), moderation }, { log: () => undefined, pepper: PEPPER })).toBeUndefined();
  });

  it("shares the breaker with the rooms' names: after five unchecked answers the name check asks the provider no more", async () => {
    const provider = vi.fn(() => Promise.resolve<"unchecked">("unchecked"));
    const clock = { now: T0 };
    const options = { log: () => undefined, pepper: PEPPER, now: () => clock.now, provider };
    const settings = { worlds: new Map([["earth", { rules: WORLD }]]), moderation };
    const ask = providerOf(settings, options);
    for (let n = 0; n < 5; n += 1) await ask?.("hi");
    expect(provider).toHaveBeenCalledTimes(5);
    const name = nameCheckerFor(settings, { ...options, ask });
    expect(await name("earth", "a-kyoto-room")).toBe("unchecked");
    expect(provider).toHaveBeenCalledTimes(5);
  });
});

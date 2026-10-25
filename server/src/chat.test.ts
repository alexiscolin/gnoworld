import { mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import type { DatabaseSync } from "node:sqlite";
import { afterAll, afterEach, describe, expect, it, vi } from "vitest";
import { z } from "zod";
import { makeApp } from "./app.ts";
import { startChat, type Chat } from "./chat.ts";
import { loadConfig } from "./config.ts";
import { openDatabase } from "./db.ts";
import { logger } from "./log.ts";
import { LOGIN_TABLES } from "./login/login.ts";
import { VERDICT_TABLES } from "./moderation/check.ts";
import type { Answer } from "./moderation/provider.ts";
import type { Rules } from "./roles/roles.ts";
import { ROOM_TABLES } from "./rooms/rooms.ts";
import { answer } from "./testing/answers.ts";
import { fakeErgo, message, PASSWORD, welcome } from "./testing/fakeErgo.ts";

const T0 = Date.parse("2026-10-22T12:00:00.000Z");
const MINUTE = 60_000;
const PEPPER = "a-pepper-of-forty-characters-0123456789";
const logged: string[] = [];
const log = logger(PEPPER, (line) => logged.push(line));
const RULES: Rules = { bannedWords: ["spam"], linksPerMessage: 3, mentionsPerMessage: 5, linksForNewAccount: 2 };
const worlds = (...slugs: string[]) => new Map(slugs.map((slug) => [slug, { rules: RULES }]));
const OFF = { openaiKey: undefined, thresholds: {}, newAccountHours: 24 };
const OFF_ANSWER = answer();
const started: { db: DatabaseSync; chat: Chat }[] = [];
afterEach(async () => {
  logged.splice(0);
  for (const { db, chat } of started.splice(0)) {
    await chat.stop();
    db.close();
  }
});

const setup = (
  settings: Parameters<typeof startChat>[1],
  { now, provider }: { now?: () => number; provider?: (text: string) => Promise<Answer | "unchecked"> } = {},
) => {
  const db = openDatabase(":memory:", [LOGIN_TABLES, ROOM_TABLES, VERDICT_TABLES]);
  const options = {
    log,
    pepper: PEPPER,
    ...(now === undefined ? {} : { now }),
    ...(provider === undefined ? {} : { provider }),
  };
  const chat = startChat(db, settings, options);
  started.push({ db, chat });
  const app = makeApp(log, () => true);
  app.route("/api/activity", chat.routes);
  const rooms = async (worlds: string) => (await app.request(`/api/activity?worlds=${worlds}`)).text();
  return { db, rooms };
};

describe("the chat, as the server starts it", () => {
  it("makes each world's main room, and answers their activity with no link when Ergo is not set", async () => {
    const { rooms } = setup({ worlds: worlds("earth", "bubble"), ergo: undefined, moderation: OFF }, { now: () => T0 });
    expect(await rooms("earth,bubble")).toBe(
      JSON.stringify({
        rooms: [
          { world: "earth", room: "#earth", perMinute: 0 },
          { world: "bubble", room: "#bubble", perMinute: 0 },
        ],
      }),
    );
  });

  it("counts what the link hands on, by the clock it is given", async () => {
    const ergo = await fakeErgo();
    const clock = { now: T0 };
    const ergoAt = { host: "127.0.0.1", port: ergo.port, password: PASSWORD };
    const { rooms } = setup({ worlds: worlds("bubble"), ergo: ergoAt, moderation: OFF }, { now: () => clock.now });
    const peer = await ergo.peer(0);
    await welcome(peer);
    peer.say(message("account=g1a;msgid=m1", "a!u@h", ["#bubble", "hi"]));
    const rate = (perMinute: number) => JSON.stringify({ rooms: [{ world: "bubble", room: "#bubble", perMinute }] });
    await expect.poll(() => rooms("bubble")).toBe(rate(0.2));
    clock.now += 5 * MINUTE;
    expect(await rooms("bubble")).toBe(rate(0));
  });

  it("leaves Ergo when it stops, and never connects again", async () => {
    const ergo = await fakeErgo();
    const ergoAt = { host: "127.0.0.1", port: ergo.port, password: PASSWORD };
    setup({ worlds: worlds("bubble"), ergo: ergoAt, moderation: OFF }, { now: () => T0 });
    const peer = await ergo.peer(0);
    await welcome(peer);
    const left = new Promise((resolve) => peer.socket.once("close", resolve));
    await started.at(-1)?.chat.stop();
    await left;
    await new Promise((resolve) => setTimeout(resolve, 100));
    expect(ergo.peers).toHaveLength(1);
  });

  it("keeps the system's clock by default", () => {
    const before = Date.now();
    const { db } = setup({ worlds: worlds("earth"), ergo: undefined, moderation: OFF });
    const { at } = z.object({ at: z.number() }).parse(db.prepare("SELECT created_at AS at FROM rooms").get());
    expect(at).toBeGreaterThanOrEqual(before);
    expect(at).toBeLessThanOrEqual(Date.now());
  });

  it("checks each message the link reads, by its world's rules first, and records the verdict", async () => {
    const ergo = await fakeErgo();
    const ergoAt = { host: "127.0.0.1", port: ergo.port, password: PASSWORD };
    const asked: string[] = [];
    const provider = (text: string): Promise<"unchecked"> => {
      asked.push(text);
      return Promise.resolve("unchecked");
    };
    const { db } = setup({ worlds: worlds("bubble"), ergo: ergoAt, moderation: OFF }, { now: () => T0, provider });
    const peer = await ergo.peer(0);
    await welcome(peer);
    peer.say(message("account=g1a;msgid=m1", "a!u@h", ["#bubble", "buy spam"]));
    peer.say(message("account=g1a;msgid=m2", "a!u@h", ["#bubble", "hello"]));
    const Verdicts = z.array(z.object({ msgid: z.string(), action: z.string(), reason: z.string().nullable() }));
    const verdicts = () =>
      Verdicts.parse(db.prepare("SELECT msgid, action, reason FROM verdicts ORDER BY msgid").all());
    await expect.poll(verdicts).toEqual([
      { msgid: "m1", action: "hide", reason: "banned_word" },
      { msgid: "m2", action: "unchecked", reason: null },
    ]);
    expect(asked).toEqual(["hello"]);
  });

  // A link, a fake Ergo welcomed, and what the link hands on, through startChat as main calls it.
  const linked = async (
    settings: Omit<Parameters<typeof startChat>[1], "ergo">,
    more: Parameters<typeof setup>[1] = {},
  ) => {
    const ergo = await fakeErgo();
    const ergoAt = { host: "127.0.0.1", port: ergo.port, password: PASSWORD };
    const chat = setup({ ...settings, ergo: ergoAt }, { now: () => T0, ...more });
    const peer = await ergo.peer(0);
    await welcome(peer);
    const Verdicts = z.array(z.object({ msgid: z.string(), action: z.string(), reason: z.string().nullable() }));
    const verdicts = () =>
      Verdicts.parse(chat.db.prepare("SELECT msgid, action, reason FROM verdicts ORDER BY msgid").all());
    return { ...chat, peer, verdicts };
  };

  it("applies each world's own rules to its own room", async () => {
    const earth: Rules = { ...RULES, bannedWords: ["moon"] };
    const both = new Map([
      ["earth", { rules: earth }],
      ["bubble", { rules: RULES }],
    ]);
    const { peer, verdicts } = await linked(
      { worlds: both, moderation: OFF },
      { provider: () => Promise.resolve("unchecked") },
    );
    peer.say(message("account=g1a;msgid=m1", "a!u@h", ["#earth", "the moon"]));
    peer.say(message("account=g1a;msgid=m2", "a!u@h", ["#bubble", "the moon"]));
    await expect.poll(verdicts).toEqual([
      { msgid: "m1", action: "hide", reason: "banned_word" },
      { msgid: "m2", action: "unchecked", reason: null },
    ]);
  });

  it("passes the moderation's settings on: a new account's hours, and the thresholds", async () => {
    const fresh = "g1jg8mtutu9khhfwc4nxmuhcpftf0pajdhfvsqf5";
    const scored: Answer = {
      flagged: Object.fromEntries(Object.keys(OFF_ANSWER.flagged).map((c) => [c, false])) as Answer["flagged"],
      scores: { ...OFF_ANSWER.scores, harassment: 0.5 },
    };
    const moderation = { openaiKey: undefined, thresholds: { harassment: 0.5 }, newAccountHours: 1 };
    const { db, peer, verdicts } = await linked(
      { worlds: worlds("bubble"), moderation },
      { provider: (text) => Promise.resolve(text === "rude words" ? scored : OFF_ANSWER) },
    );
    db.prepare("INSERT INTO accounts (address, first_seen) VALUES (?, ?)").run(fresh, T0 - 60 * MINUTE);
    peer.say(
      message(`account=${fresh};msgid=m1`, "a!u@h", ["#bubble", "https://a.test https://b.test https://c.test"]),
    );
    peer.say(message(`account=${fresh};msgid=m2`, "a!u@h", ["#bubble", "rude words"]));
    await expect.poll(verdicts).toEqual([
      { msgid: "m1", action: "pass", reason: null },
      { msgid: "m2", action: "hide", reason: "harassment" },
    ]);
  });

  it("sends nothing to OpenAI without a key: every message unchecked, and the alert once at the start", async () => {
    const calls: string[] = [];
    vi.stubGlobal("fetch", (url: string) => {
      calls.push(url);
      return Promise.reject(new Error("no network here"));
    });
    const { peer, verdicts } = await linked({ worlds: worlds("bubble"), moderation: OFF });
    peer.say(message("account=g1a;msgid=m1", "a!u@h", ["#bubble", "hello"]));
    await expect.poll(verdicts).toEqual([{ msgid: "m1", action: "unchecked", reason: "no_key" }]);
    expect(calls).toEqual([]);
    expect(logged.filter((line) => line.includes('"event":"alert"') && line.includes('"moderation_off"'))).toHaveLength(
      1,
    );
    vi.unstubAllGlobals();
  });

  it("stops while a check is in flight: it waits for it, then nothing more runs", async () => {
    let release = (): void => undefined;
    const held = new Promise<"unchecked">((resolve) => {
      release = () => {
        resolve("unchecked");
      };
    });
    const { peer, verdicts } = await linked({ worlds: worlds("bubble"), moderation: OFF }, { provider: () => held });
    peer.say(message("account=g1a;msgid=m1", "a!u@h", ["#bubble", "hello"]));
    await expect.poll(verdicts).toEqual([{ msgid: "m1", action: "pending", reason: null }]);
    const entry = started.at(-1);
    let stopped = false;
    const stopping = entry?.chat.stop().then(() => (stopped = true));
    await new Promise((resolve) => setImmediate(resolve));
    expect(stopped).toBe(false);
    release();
    await stopping;
    expect(verdicts()).toEqual([{ msgid: "m1", action: "unchecked", reason: null }]);
  });

  describe("the chat's check, its green pass (3i)", () => {
    const dir = mkdtempSync(join(tmpdir(), "gnoworld-chat-"));
    afterAll(() => {
      rmSync(dir, { recursive: true, force: true });
    });
    const verdictsOf = (db: DatabaseSync) =>
      z
        .array(z.object({ msgid: z.string(), action: z.string(), reason: z.string().nullable() }))
        .parse(db.prepare("SELECT msgid, action, reason FROM verdicts ORDER BY msgid").all());

    it("asks OpenAI with the key the settings read, as the server starts it", async () => {
      const key = `sk-${"k".repeat(40)}`;
      const files = { key: join(dir, "key"), pepper: join(dir, "pepper") };
      writeFileSync(files.key, `${key}\n`);
      writeFileSync(files.pepper, `${PEPPER}\n`);
      const config = loadConfig({
        DATABASE: join(dir, "server.db"),
        LOG_PEPPER_FILE: files.pepper,
        OPENAI_API_KEY_FILE: files.key,
      });
      const calls: { url: string; init: RequestInit }[] = [];
      const omni = JSON.stringify({
        results: [{ categories: OFF_ANSWER.flagged, category_scores: OFF_ANSWER.scores }],
      });
      vi.stubGlobal("fetch", (url: string, init: RequestInit) => {
        calls.push({ url, init });
        return Promise.resolve(new Response(omni));
      });
      const mark = logged.length;
      const { peer, verdicts } = await linked({ worlds: worlds("bubble"), moderation: config.moderation });
      expect(logged.slice(mark).filter((line) => line.includes('"moderation_off"'))).toEqual([]);
      peer.say(message("account=g1a;msgid=m1", "a!u@h", ["#bubble", "hello"]));
      await expect.poll(verdicts).toEqual([{ msgid: "m1", action: "pass", reason: null }]);
      vi.unstubAllGlobals();
      expect(calls.map(({ url }) => url)).toEqual(["https://api.openai.com/v1/moderations"]);
      expect(new Headers(calls[0]?.init.headers).get("authorization")).toBe(`Bearer ${key}`);
      expect(calls[0]?.init.body).toBe(JSON.stringify({ model: "omni-moderation-latest", input: "hello" }));
    });

    it("holds an account 59 minutes old to a new account's links under a one-hour setting", async () => {
      const fresh = "g1jg8mtutu9khhfwc4nxmuhcpftf0pajdhfvsqf5";
      const moderation = { openaiKey: undefined, thresholds: {}, newAccountHours: 1 };
      const { db, peer, verdicts } = await linked(
        { worlds: worlds("bubble"), moderation },
        { provider: () => Promise.resolve(OFF_ANSWER) },
      );
      db.prepare("INSERT INTO accounts (address, first_seen) VALUES (?, ?)").run(fresh, T0 - 59 * MINUTE);
      peer.say(
        message(`account=${fresh};msgid=m1`, "a!u@h", ["#bubble", "https://a.test https://b.test https://c.test"]),
      );
      await expect.poll(verdicts).toEqual([{ msgid: "m1", action: "hide", reason: "new_account_links" }]);
    });

    it("stops with lines waiting: none of them is checked once the running ones end", async () => {
      const asked: string[] = [];
      let release = (): void => undefined;
      const held = new Promise<"unchecked">((resolve) => {
        release = () => {
          resolve("unchecked");
        };
      });
      const provider = (text: string): Promise<"unchecked"> => {
        asked.push(text);
        return held;
      };
      const { peer, verdicts } = await linked({ worlds: worlds("bubble"), moderation: OFF }, { provider });
      // Four checks run at once; the fifth line waits.
      for (const n of [1, 2, 3, 4, 5])
        peer.say(message(`account=g1a;msgid=m${String(n)}`, "a!u@h", ["#bubble", `line ${String(n)}`]));
      await expect.poll(() => asked.length).toBe(4);
      await expect.poll(() => verdicts().length).toBe(4);
      const stopping = started.at(-1)?.chat.stop();
      release();
      await stopping;
      expect(asked).toHaveLength(4);
    });

    it("raises no moderation_off alert when a provider is set", async () => {
      const mark = logged.length;
      await linked({ worlds: worlds("bubble"), moderation: OFF }, { provider: () => Promise.resolve(OFF_ANSWER) });
      expect(logged.slice(mark).filter((line) => line.includes('"moderation_off"'))).toEqual([]);
    });

    it("leaves unchecked, and sends nowhere, a line of a room whose world the file no longer names", async () => {
      const ergo = await fakeErgo();
      const asked: string[] = [];
      const ergoAt = { host: "127.0.0.1", port: ergo.port, password: PASSWORD };
      const provider = (text: string): Promise<Answer> => {
        asked.push(text);
        return Promise.resolve(OFF_ANSWER);
      };
      const { db } = setup({ worlds: worlds("bubble"), ergo: ergoAt, moderation: OFF }, { now: () => T0, provider });
      db.prepare("INSERT INTO rooms (name, world, created_at) VALUES ('#gone', 'gone', 0)").run();
      const peer = await ergo.peer(0);
      await welcome(peer);
      peer.say(message("account=g1a;msgid=m1", "a!u@h", ["#gone", "hello"]));
      await expect.poll(() => verdictsOf(db)).toEqual([{ msgid: "m1", action: "unchecked", reason: "unknown_room" }]);
      expect(asked).toEqual([]);
    });
  });
});

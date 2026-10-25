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
import { PROGRESS_TABLES } from "./moderation/catchup.ts";
import { VERDICT_TABLES } from "./moderation/check.ts";
import { MUTE_TABLES } from "./moderation/mute.ts";
import { ROOM_STATE } from "./rooms/create.ts";
import type { Answer } from "./moderation/provider.ts";
import type { Room, Rules } from "./roles/roles.ts";
import { listRooms, ROOM_TABLES } from "./rooms/rooms.ts";
import { answer } from "./testing/answers.ts";
import { fakeErgo, message, PASSWORD, welcome } from "./testing/fakeErgo.ts";

const T0 = Date.parse("2026-10-22T12:00:00.000Z");
// A mute's line, not a room's mode, which the bot sets too (3l).
const MUTE_LINE = /^SAMODE \S+ [+-]b m:/;
const MINUTE = 60_000;
const PEPPER = "a-pepper-of-forty-characters-0123456789";
const logged: string[] = [];
const log = logger(PEPPER, (line) => logged.push(line));
const RULES: Rules = { bannedWords: ["spam"], linksPerMessage: 3, mentionsPerMessage: 5, linksForNewAccount: 2 };
const worlds = (...slugs: string[]) => new Map(slugs.map((slug) => [slug, { rules: RULES }]));
const MUTE = { strikes: 3, windowMinutes: 10, minutes: 5, max: 50 };
const OFF = { openaiKey: undefined, thresholds: {}, newAccountHours: 24, mute: MUTE };
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
  {
    now,
    provider,
    tickMs,
    session,
  }: {
    now?: () => number;
    provider?: (text: string) => Promise<Answer | "unchecked">;
    tickMs?: number;
    session?: (token: string | undefined) => string | undefined;
  } = {},
) => {
  const db = openDatabase(":memory:", [
    LOGIN_TABLES,
    ROOM_TABLES,
    VERDICT_TABLES,
    PROGRESS_TABLES,
    MUTE_TABLES,
    ROOM_STATE,
  ]);
  const options = {
    log,
    pepper: PEPPER,
    ...(now === undefined ? {} : { now }),
    ...(provider === undefined ? {} : { provider }),
    ...(tickMs === undefined ? {} : { tickMs }),
    ...(session === undefined ? {} : { session }),
  };
  const chat = startChat(db, settings, options);
  started.push({ db, chat });
  const app = makeApp(log, () => true);
  app.route("/api/activity", chat.activity);
  app.route("/api/stream", chat.stream);
  const rooms = async (worlds: string) => (await app.request(`/api/activity?worlds=${worlds}`)).text();
  return { db, rooms, app, chat };
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
    return { ...chat, peer, verdicts, ergo };
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
    const moderation = { openaiKey: undefined, thresholds: { harassment: 0.5 }, newAccountHours: 1, mute: MUTE };
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
      const moderation = { ...OFF, newAccountHours: 1 };
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

  describe("acting and streaming (3j)", () => {
    const T = (ms: number) => new Date(Date.parse("2026-10-22T08:00:00.000Z") + ms).toISOString();
    const before = (ms: number) => T(ms - 1);
    // A room's line as Ergo relays it live, with its time.
    const line = (id: string, ms: number, [account, text]: readonly [string, string]) =>
      message(`account=${account};msgid=${id};time=${T(ms)}`, `${account}!u@h`, ["#bubble", text]);
    const flags = (text: string): Answer => ({
      flagged: { ...OFF_ANSWER.flagged, violence: text.includes("hurt") },
      scores: { ...OFF_ANSWER.scores, violence: text.includes("hurt") ? 0.99 : 0 },
    });
    // A gate a provider's answers wait on, opened by the test.
    const gate = () => {
      let open = (): void => undefined;
      const opened = new Promise<void>((resolve) => {
        open = resolve;
      });
      return { opened, open };
    };
    // The verdicts' stream of #bubble as a page reads it, through the chat's own route.
    const follow = async (
      app: { request: ReturnType<typeof makeApp>["request"] },
      more: { peer?: string; realIp?: string } = {},
    ) => {
      const response = await app.request(
        "/api/stream?rooms=%23bubble",
        { headers: more.realIp === undefined ? {} : { "x-real-ip": more.realIp } },
        { incoming: { socket: { remoteAddress: more.peer ?? "203.0.113.7" } } },
      );
      const reader: ReadableStreamDefaultReader<Uint8Array> | undefined = response.body?.getReader();
      let text = "";
      const read = async (count: number): Promise<unknown[]> => {
        for (;;) {
          const data = [...text.matchAll(/data: (.*)\n/g)].map(([, json = ""]) => JSON.parse(json) as unknown);
          if (data.length >= count) return data;
          const chunk = await reader?.read();
          if (chunk === undefined || chunk.done) return data;
          text += new TextDecoder().decode(chunk.value);
        }
      };
      return { response, read };
    };
    const sent = (peer: { lines: string[] }) => peer.lines.filter((l) => /^(REDACT|NOTICE) /.test(l));
    const settle = async (peer: { say: (l: string) => void; next: (p: RegExp) => Promise<string> }) => {
      peer.say("PING :settled");
      await peer.next(/^PONG settled$/);
    };
    // The link dropped and back: the second connection, welcomed.
    const reconnect = async (peer: { socket: { destroy: () => void } }, ergo: Awaited<ReturnType<typeof fakeErgo>>) => {
      peer.socket.destroy();
      const again = await ergo.peer(1);
      await welcome(again);
      return again;
    };

    it("hides a flagged line in Ergo, tells its author why, and streams each verdict, checked or hidden", async () => {
      const { app, peer } = await linked(
        { worlds: worlds("bubble"), moderation: OFF },
        { provider: (text) => Promise.resolve(flags(text)) },
      );
      const page = await follow(app);
      peer.say(line("m1", 1, ["g1author", "I will hurt you"]));
      peer.say(line("m2", 2, ["g1author", "sorry"]));
      expect(await peer.next(/^REDACT /)).toBe("REDACT #bubble m1 violence");
      expect(await peer.next(/^NOTICE /)).toBe(
        "NOTICE g1author :Your message in #bubble was hidden: violence. The rules: https://gno.world/rules",
      );
      expect(await page.read(2)).toEqual([
        { msgid: "m1", room: "#bubble", state: "hidden" },
        { msgid: "m2", room: "#bubble", state: "checked" },
      ]);
    });

    it("hides on a world's rule without asking the provider, in the rule's own words", async () => {
      const asked: string[] = [];
      const { app, peer } = await linked(
        { worlds: worlds("bubble"), moderation: OFF },
        {
          provider: (text) => {
            asked.push(text);
            return Promise.resolve(OFF_ANSWER);
          },
        },
      );
      const page = await follow(app);
      peer.say(line("m1", 1, ["g1a", "buy spam"]));
      expect(await peer.next(/^REDACT /)).toBe("REDACT #bubble m1 :a word this world bans");
      expect(await peer.next(/^NOTICE /)).toBe(
        "NOTICE g1a :Your message in #bubble was hidden: a word this world bans. The rules: https://gno.world/rules",
      );
      expect(await page.read(1)).toEqual([{ msgid: "m1", room: "#bubble", state: "hidden" }]);
      expect(asked).toEqual([]);
    });

    it("streams nothing for an unchecked line, and nothing for a line before its verdict", async () => {
      const slow = gate();
      const { app, peer } = await linked(
        { worlds: worlds("bubble"), moderation: OFF },
        {
          provider: async (text) => {
            if (text === "down") return "unchecked";
            if (text === "slow") await slow.opened;
            return OFF_ANSWER;
          },
        },
      );
      const page = await follow(app);
      peer.say(line("m1", 1, ["g1a", "down"]));
      peer.say(line("m2", 2, ["g1b", "slow"]));
      peer.say(line("m3", 3, ["g1c", "fine"]));
      expect(await page.read(1)).toEqual([{ msgid: "m3", room: "#bubble", state: "checked" }]);
      slow.open();
      expect(await page.read(2)).toEqual([
        { msgid: "m3", room: "#bubble", state: "checked" },
        { msgid: "m2", room: "#bubble", state: "checked" },
      ]);
      expect(sent(peer)).toEqual([]);
    });

    it("pairs each hide with its own line and author, answers coming back in reverse", async () => {
      const slow = gate();
      const { peer } = await linked(
        { worlds: worlds("bubble"), moderation: OFF },
        {
          provider: async (text) => {
            if (text.includes("slow")) await slow.opened;
            return flags(text);
          },
        },
      );
      peer.say(line("m1", 1, ["g1a", "slow hurt"]));
      peer.say(line("m2", 2, ["g1b", "hurt"]));
      expect(await peer.next(/^NOTICE /)).toMatch(/^NOTICE g1b /);
      slow.open();
      expect(await peer.next(/^NOTICE /)).toMatch(/^NOTICE g1a /);
      expect(sent(peer).filter((l) => l.startsWith("REDACT"))).toEqual([
        "REDACT #bubble m2 violence",
        "REDACT #bubble m1 violence",
      ]);
    });

    it("acts once on a line it hears twice, live then in a catch-up page", async () => {
      const { app, peer, ergo } = await linked(
        { worlds: worlds("bubble"), moderation: OFF },
        { provider: (text) => Promise.resolve(flags(text)) },
      );
      peer.say(line("m1", 1, ["g1a", "hurt"]));
      await peer.next(/^NOTICE /);
      const again = await reconnect(peer, ergo);
      expect(await again.next(/^CHATHISTORY /)).toBe(`CHATHISTORY AFTER #bubble timestamp=${before(1)} 50`);
      again.say(":ergo.test BATCH +a chathistory #bubble");
      again.say(`@batch=a;account=g1a;msgid=m1;time=${T(1)} :g1a!u@h PRIVMSG #bubble :hurt`);
      again.say(":ergo.test BATCH -a");
      again.say(line("m2", 2, ["g1b", "fine"]));
      await settle(again);
      const page = await follow(app);
      expect(await page.read(2)).toEqual([
        { msgid: "m1", room: "#bubble", state: "hidden" },
        { msgid: "m2", room: "#bubble", state: "checked" },
      ]);
      expect([...sent(peer), ...sent(again)].filter((l) => l.startsWith("REDACT"))).toEqual([
        "REDACT #bubble m1 violence",
      ]);
    });

    it("hides, once the link is back, a line flagged while it was down", async () => {
      const late = gate();
      let calls = 0;
      const { peer, ergo } = await linked(
        { worlds: worlds("bubble"), moderation: OFF },
        {
          provider: async (text) => {
            calls += 1;
            if (calls === 1) await late.opened;
            return flags(text);
          },
        },
      );
      peer.say(line("m1", 1, ["g1a", "hurt"]));
      await expect.poll(() => calls).toBe(1);
      peer.socket.destroy();
      await expect.poll(() => logged.some((l) => l.includes('"irc_closed"'))).toBe(true);
      late.open();
      const again = await ergo.peer(1);
      await welcome(again);
      expect(await again.next(/^CHATHISTORY /)).toBe(`CHATHISTORY AFTER #bubble timestamp=${before(1)} 50`);
      again.say(":ergo.test BATCH +a chathistory #bubble");
      again.say(`@batch=a;account=g1a;msgid=m1;time=${T(1)} :g1a!u@h PRIVMSG #bubble :hurt`);
      again.say(":ergo.test BATCH -a");
      expect(await again.next(/^REDACT /)).toBe("REDACT #bubble m1 violence");
      expect(await again.next(/^NOTICE /)).toMatch(/^NOTICE g1a /);
      expect(sent(peer)).toEqual([]);
    });

    it("settles a line it hears again in a catch-up page, so its mark moves on past it", async () => {
      const { peer, verdicts, ergo } = await linked(
        { worlds: worlds("bubble"), moderation: OFF },
        { provider: () => Promise.resolve(OFF_ANSWER) },
      );
      peer.say(line("m1", 1, ["g1a", "hello"]));
      await expect.poll(verdicts).toEqual([{ msgid: "m1", action: "pass", reason: null }]);
      const again = await reconnect(peer, ergo);
      await again.next(/^CHATHISTORY /);
      again.say(":ergo.test BATCH +a chathistory #bubble");
      again.say(`@batch=a;account=g1a;msgid=m1;time=${T(1)} :g1a!u@h PRIVMSG #bubble :hello`);
      again.say(":ergo.test BATCH -a");
      again.say(line("m2", 2, ["g1b", "fine"]));
      await expect.poll(() => verdicts().length).toBe(2);
      await settle(again);
      again.socket.destroy();
      const third = await ergo.peer(2);
      await welcome(third);
      expect(await third.next(/^CHATHISTORY /)).toBe(`CHATHISTORY AFTER #bubble timestamp=${before(2)} 50`);
    });

    it("keeps its mark before a line whose hide failed, though a later line passed", async () => {
      const late = gate();
      let calls = 0;
      const { peer, verdicts, ergo } = await linked(
        { worlds: worlds("bubble"), moderation: OFF },
        {
          provider: async (text) => {
            calls += 1;
            if (calls === 1) await late.opened;
            return flags(text);
          },
        },
      );
      peer.say(line("m1", 1, ["g1a", "hurt"]));
      await expect.poll(() => calls).toBe(1);
      peer.socket.destroy();
      await expect.poll(() => logged.some((l) => l.includes('"irc_closed"'))).toBe(true);
      late.open();
      const again = await ergo.peer(1);
      await welcome(again);
      await again.next(/^CHATHISTORY /);
      again.say(line("m2", 2, ["g1b", "fine"]));
      await expect.poll(verdicts).toContainEqual({ msgid: "m2", action: "pass", reason: null });
      await settle(again);
      again.socket.destroy();
      const third = await ergo.peer(2);
      await welcome(third);
      expect(await third.next(/^CHATHISTORY /)).toBe(`CHATHISTORY AFTER #bubble timestamp=${before(1)} 50`);
    });

    it("asks what it missed after a reconnect, from just before the last line it checked", async () => {
      const { peer, verdicts, ergo } = await linked(
        { worlds: worlds("bubble"), moderation: OFF },
        { provider: () => Promise.resolve(OFF_ANSWER) },
      );
      peer.say(line("m7", 7, ["g1a", "hello"]));
      await expect.poll(verdicts).toEqual([{ msgid: "m7", action: "pass", reason: null }]);
      const again = await reconnect(peer, ergo);
      expect(await again.next(/^CHATHISTORY /)).toBe(`CHATHISTORY AFTER #bubble timestamp=${before(7)} 50`);
    });

    it("moves its mark past an unchecked line: a provider's outage is not caught up", async () => {
      const { peer, verdicts, ergo } = await linked(
        { worlds: worlds("bubble"), moderation: OFF },
        { provider: (text) => Promise.resolve(text === "down" ? "unchecked" : OFF_ANSWER) },
      );
      peer.say(line("m1", 1, ["g1a", "down"]));
      peer.say(line("m2", 2, ["g1b", "fine"]));
      await expect.poll(() => verdicts().length).toBe(2);
      const again = await reconnect(peer, ergo);
      expect(await again.next(/^CHATHISTORY /)).toBe(`CHATHISTORY AFTER #bubble timestamp=${before(2)} 50`);
    });

    it("asks again from before a line still being checked, never past it", async () => {
      const slow = gate();
      const { peer, verdicts, ergo } = await linked(
        { worlds: worlds("bubble"), moderation: OFF },
        {
          provider: async (text) => {
            if (text === "slow") await slow.opened;
            return OFF_ANSWER;
          },
        },
      );
      peer.say(line("m1", 1, ["g1a", "first"]));
      await expect.poll(verdicts).toEqual([{ msgid: "m1", action: "pass", reason: null }]);
      peer.say(line("m2", 2, ["g1b", "slow"]));
      peer.say(line("m3", 3, ["g1c", "third"]));
      await expect.poll(verdicts).toContainEqual({ msgid: "m3", action: "pass", reason: null });
      const again = await reconnect(peer, ergo);
      expect(await again.next(/^CHATHISTORY /)).toBe(`CHATHISTORY AFTER #bubble timestamp=${before(1)} 50`);
      slow.open();
    });

    it("holds its mark before a line still being checked that a page brings again", async () => {
      const slow = gate();
      const { peer, verdicts, ergo } = await linked(
        { worlds: worlds("bubble"), moderation: OFF },
        {
          provider: async (text) => {
            if (text === "slow") await slow.opened;
            return OFF_ANSWER;
          },
        },
      );
      peer.say(line("m1", 1, ["g1a", "first"]));
      await expect.poll(verdicts).toEqual([{ msgid: "m1", action: "pass", reason: null }]);
      peer.say(line("m2", 2, ["g1b", "slow"]));
      peer.say(line("m3", 3, ["g1c", "third"]));
      await expect.poll(verdicts).toContainEqual({ msgid: "m3", action: "pass", reason: null });
      const again = await reconnect(peer, ergo);
      await again.next(/^CHATHISTORY /);
      again.say(":ergo.test BATCH +a chathistory #bubble");
      again.say(`@batch=a;account=g1b;msgid=m2;time=${T(2)} :g1b!u@h PRIVMSG #bubble :slow`);
      again.say(`@batch=a;account=g1c;msgid=m3;time=${T(3)} :g1c!u@h PRIVMSG #bubble :third`);
      again.say(":ergo.test BATCH -a");
      await settle(again);
      again.socket.destroy();
      const third = await ergo.peer(2);
      await welcome(third);
      expect(await third.next(/^CHATHISTORY /)).toBe(`CHATHISTORY AFTER #bubble timestamp=${before(1)} 50`);
      slow.open();
    });

    it("checks 300 missed lines of one account page by page, none dropped", async () => {
      const { peer, verdicts, ergo } = await linked(
        { worlds: worlds("bubble"), moderation: OFF },
        { provider: () => Promise.resolve(OFF_ANSWER) },
      );
      peer.say(line("m0", 0, ["g1a", "before"]));
      await expect.poll(() => verdicts().length).toBe(1);
      const again = await reconnect(peer, ergo);
      for (let p = 0; p <= 6; p += 1) {
        await again.next(/^CHATHISTORY /);
        again.say(`:ergo.test BATCH +p${String(p)} chathistory #bubble`);
        for (let n = 0; n < (p < 6 ? 50 : 0); n += 1) {
          const ms = 1 + p * 50 + n;
          again.say(
            `@batch=p${String(p)};account=g1a;msgid=x${String(ms)};time=${T(ms)} :g1a!u@h PRIVMSG #bubble :line`,
          );
        }
        again.say(`:ergo.test BATCH -p${String(p)}`);
      }
      await expect.poll(() => verdicts().length, { timeout: 10_000 }).toBe(301);
      expect(logged.filter((l) => l.includes("moderation_account_full"))).toEqual([]);
    });

    it("moves its mark past a line the full queue refuses, with the log saying so", async () => {
      const held = gate();
      const { peer, verdicts, ergo } = await linked(
        { worlds: worlds("bubble"), moderation: OFF },
        {
          provider: async () => {
            await held.opened;
            return OFF_ANSWER;
          },
        },
      );
      for (let n = 1; n <= 105; n += 1) peer.say(line(`m${String(n)}`, n, ["g1a", "flood"]));
      await expect.poll(() => logged.some((l) => l.includes("moderation_account_full"))).toBe(true);
      held.open();
      // Settled, each: past 20 a minute the flood is hidden as too fast (3k).
      await expect.poll(() => verdicts().filter(({ action }) => action !== "pending").length).toBe(104);
      const again = await reconnect(peer, ergo);
      expect(await again.next(/^CHATHISTORY /)).toBe(`CHATHISTORY AFTER #bubble timestamp=${before(105)} 50`);
    });

    it("counts the stream's visitors by the proxy's X-Real-IP when TRUSTED_PROXY is the peer", async () => {
      const { app } = setup({ worlds: worlds("bubble"), moderation: OFF, ergo: undefined, trustedProxy: "10.0.0.2" });
      for (const realIp of ["192.0.2.1", "192.0.2.2"]) {
        for (let n = 0; n < 4; n += 1) {
          expect((await follow(app, { peer: "10.0.0.2", realIp })).response.status).toBe(200);
        }
      }
      expect((await follow(app, { peer: "10.0.0.2", realIp: "192.0.2.1" })).response.status).toBe(429);
    });

    it("ends an open stream when it stops, so the server's drain is not held", async () => {
      const { app } = setup({ worlds: worlds("bubble"), moderation: OFF, ergo: undefined });
      const page = await follow(app);
      await started.at(-1)?.chat.stop();
      expect(await page.read(1)).toEqual([]);
    });

    describe("the mute and the edits (3k)", () => {
      const mutes = (peer: { lines: string[] }) => peer.lines.filter((l) => MUTE_LINE.test(l));
      const redacts = (peer: { lines: string[] }) => sent(peer).filter((l) => l.startsWith("REDACT"));
      const hurt = (provider = (text: string) => Promise.resolve(flags(text))) => ({ provider });
      // A page of history as Ergo sends it after a reconnect: each line with its own time.
      const page = (peer: { say: (l: string) => void }, lines: [string, number, string, string][]) => {
        peer.say(":ergo.test BATCH +h chathistory #bubble");
        for (const [id, ms, account, text] of lines) {
          peer.say(`@batch=h;account=${account};msgid=${id};time=${T(ms)} :${account}!u@h PRIVMSG #bubble :${text}`);
        }
        peer.say(":ergo.test BATCH -h");
      };

      it("mutes an account hidden three times in ten minutes, in its world's rooms, by itself", async () => {
        const { peer } = await linked({ worlds: worlds("bubble"), moderation: OFF }, hurt());
        peer.say(line("m1", 1, ["g1a", "hurt"]));
        peer.say(line("m2", 2, ["g1a", "hurt"]));
        peer.say(line("m3", 3, ["g1b", "hurt"]));
        await expect.poll(() => redacts(peer)).toHaveLength(3);
        await settle(peer);
        expect(mutes(peer)).toEqual([]);
        peer.say(line("m4", 4, ["g1a", "hurt"]));
        expect(await peer.next(MUTE_LINE)).toBe("SAMODE #bubble +b m:g1a");
      });

      it("spares whom the roles file spares: hidden ten times, never muted, while another is", async () => {
        const { peer } = await linked(
          { worlds: worlds("bubble"), moderation: OFF, spared: (account) => account === "g1a" },
          hurt(),
        );
        for (let n = 1; n <= 10; n += 1) peer.say(line(`a${String(n)}`, n, ["g1a", "hurt"]));
        for (let n = 1; n <= 3; n += 1) peer.say(line(`b${String(n)}`, 10 + n, ["g1b", "hurt"]));
        await expect.poll(() => redacts(peer)).toHaveLength(13);
        await settle(peer);
        expect(mutes(peer)).toEqual(["SAMODE #bubble +b m:g1b"]);
      });

      it("mutes once when hides come at once", async () => {
        const slow = gate();
        const { peer } = await linked(
          { worlds: worlds("bubble"), moderation: OFF },
          hurt(async (text) => {
            await slow.opened;
            return flags(text);
          }),
        );
        for (let n = 1; n <= 4; n += 1) peer.say(line(`m${String(n)}`, n, ["g1a", "hurt"]));
        slow.open();
        await expect.poll(() => redacts(peer)).toHaveLength(4);
        await settle(peer);
        expect(mutes(peer)).toEqual(["SAMODE #bubble +b m:g1a"]);
      });

      it("reads its numbers from the settings: strikes, their window by Ergo's time, the minutes, the cap", async () => {
        const clock = { now: T0 };
        const moderation = { ...OFF, mute: { strikes: 2, windowMinutes: 3, minutes: 7, max: 1 } };
        const { peer } = await linked(
          { worlds: worlds("bubble"), moderation },
          { ...hurt(), now: () => clock.now, tickMs: 10 },
        );
        peer.say(line("m1", 0, ["g1a", "hurt"]));
        peer.say(line("m2", 3 * MINUTE + 1, ["g1a", "hurt"]));
        await expect.poll(() => redacts(peer)).toHaveLength(2);
        await settle(peer);
        expect(mutes(peer)).toEqual([]);
        peer.say(line("m3", 3 * MINUTE + 2, ["g1a", "hurt"]));
        expect(await peer.next(MUTE_LINE)).toBe("SAMODE #bubble +b m:g1a");
        clock.now = T0 + 7 * MINUTE - 1;
        await new Promise((resolve) => setTimeout(resolve, 50));
        expect(mutes(peer)).toEqual(["SAMODE #bubble +b m:g1a"]);
        clock.now = T0 + 7 * MINUTE;
        expect(await peer.next(MUTE_LINE)).toBe("SAMODE #bubble -b m:g1a");
        peer.say(line("b1", 4 * MINUTE, ["g1b", "hurt"]));
        peer.say(line("b2", 4 * MINUTE + 1, ["g1b", "hurt"]));
        expect(await peer.next(MUTE_LINE)).toBe("SAMODE #bubble +b m:g1b");
        peer.say(line("c1", 4 * MINUTE + 2, ["g1c", "hurt"]));
        peer.say(line("c2", 4 * MINUTE + 3, ["g1c", "hurt"]));
        expect([await peer.next(MUTE_LINE), await peer.next(MUTE_LINE)]).toEqual([
          "SAMODE #bubble -b m:g1b",
          "SAMODE #bubble +b m:g1c",
        ]);
      });

      it("lifts the mute after its minutes, and puts a live one back when the link returns", async () => {
        const clock = { now: T0 };
        const { peer, ergo } = await linked(
          { worlds: worlds("bubble"), moderation: OFF },
          { ...hurt(), now: () => clock.now, tickMs: 10 },
        );
        for (let n = 1; n <= 3; n += 1) peer.say(line(`m${String(n)}`, n, ["g1a", "hurt"]));
        await peer.next(/^SAMODE #bubble \+b m:g1a$/);
        const again = await reconnect(peer, ergo);
        expect(await again.next(MUTE_LINE)).toBe("SAMODE #bubble +b m:g1a");
        clock.now = T0 + 5 * MINUTE;
        expect(await again.next(MUTE_LINE)).toBe("SAMODE #bubble -b m:g1a");
      });

      it("stops its timer when it stops: no lift runs after", async () => {
        const clock = { now: T0 };
        const { peer } = await linked(
          { worlds: worlds("bubble"), moderation: OFF },
          { ...hurt(), now: () => clock.now, tickMs: 10 },
        );
        for (let n = 1; n <= 3; n += 1) peer.say(line(`m${String(n)}`, n, ["g1a", "hurt"]));
        await peer.next(/^SAMODE #bubble \+b m:g1a$/);
        await started.at(-1)?.chat.stop();
        clock.now = T0 + 6 * MINUTE;
        await new Promise((resolve) => setTimeout(resolve, 50));
        expect(mutes(peer)).toEqual(["SAMODE #bubble +b m:g1a"]);
      });

      it("counts strikes in a world apart, and mutes in that world's rooms alone", async () => {
        const { peer } = await linked({ worlds: worlds("bubble", "earth"), moderation: OFF }, hurt());
        peer.say(line("m1", 1, ["g1a", "hurt"]));
        peer.say(line("m2", 2, ["g1a", "hurt"]));
        peer.say(message(`account=g1a;msgid=m3;time=${T(3)}`, "g1a!u@h", ["#earth", "hurt"]));
        await expect.poll(() => redacts(peer)).toHaveLength(3);
        await settle(peer);
        expect(mutes(peer)).toEqual([]);
        peer.say(line("m4", 4, ["g1a", "hurt"]));
        expect(await peer.next(MUTE_LINE)).toBe("SAMODE #bubble +b m:g1a");
        await settle(peer);
        expect(mutes(peer)).toEqual(["SAMODE #bubble +b m:g1a"]);
      });

      it("hides a line too fast, past 20 a minute of Ergo's time, in its own words, and three of them mute", async () => {
        const { peer, verdicts } = await linked(
          { worlds: worlds("bubble"), moderation: OFF },
          { provider: () => Promise.resolve(OFF_ANSWER) },
        );
        for (let n = 1; n <= 23; n += 1) peer.say(line(`m${String(n)}`, n, ["g1a", "fine"]));
        expect(await peer.next(/^REDACT /)).toBe("REDACT #bubble m21 :too many messages too fast");
        await expect.poll(() => verdicts().filter(({ reason }) => reason === "too_fast")).toHaveLength(3);
        expect(await peer.next(MUTE_LINE)).toBe("SAMODE #bubble +b m:g1a");
        await settle(peer);
        expect(mutes(peer)).toHaveLength(1);
      });

      it("never finds a caught-up backlog too fast: Ergo's times, and a line seen before, once", async () => {
        const { peer, ergo, verdicts } = await linked(
          { worlds: worlds("bubble"), moderation: OFF },
          { provider: () => Promise.resolve(OFF_ANSWER) },
        );
        peer.say(line("m0", 0, ["g1a", "before"]));
        await expect.poll(() => verdicts().length).toBe(1);
        const again = await reconnect(peer, ergo);
        await again.next(/^CHATHISTORY /);
        const backlog: [string, number, string, string][] = Array.from({ length: 25 }, (_, n) => [
          `x${String(n)}`,
          (n + 1) * 24_000,
          "g1a",
          "missed",
        ]);
        page(again, [["m0", 0, "g1a", "before"], ...backlog]);
        await expect.poll(() => verdicts().length).toBe(26);
        await settle(again);
        expect([redacts(again), mutes(again)]).toEqual([[], []]);
      });

      it("checks an edit as any line: an own edit that breaks no rule stays, one that hurts is hidden alone", async () => {
        const { peer, verdicts } = await linked({ worlds: worlds("bubble"), moderation: OFF }, hurt());
        peer.say(line("m1", 1, ["g1a", "hello"]));
        peer.say(
          message(`account=g1a;msgid=m2;time=${T(2)};+gnoworld/edit=m1`, "g1a!u@h", ["#bubble", "hello, fixed"]),
        );
        peer.say(
          message(`account=g1a;msgid=m3;time=${T(3)};+gnoworld/edit=m1`, "g1a!u@h", ["#bubble", "I will hurt you"]),
        );
        expect(await peer.next(/^REDACT /)).toBe("REDACT #bubble m3 violence");
        await expect.poll(() => verdicts().length).toBe(3);
        await settle(peer);
        expect(redacts(peer)).toEqual(["REDACT #bubble m3 violence"]);
        expect(verdicts()).toContainEqual({ msgid: "m1", action: "pass", reason: null });
      });

      it("hides an edit of another's line, an edit sent right behind its own line stays, a forger is muted", async () => {
        const slow = gate();
        const { peer, verdicts } = await linked(
          { worlds: worlds("bubble"), moderation: OFF },
          {
            provider: async (text) => {
              if (text === "slow") await slow.opened;
              return OFF_ANSWER;
            },
          },
        );
        peer.say(line("m1", 1, ["g1a", "slow"]));
        peer.say(message(`account=g1a;msgid=m2;time=${T(2)};+gnoworld/edit=m1`, "g1a!u@h", ["#bubble", "fine"]));
        for (let n = 3; n <= 5; n += 1) {
          peer.say(
            message(`account=g1b;msgid=m${String(n)};time=${T(n)};+gnoworld/edit=m1`, "g1b!u@h", ["#bubble", "x"]),
          );
        }
        expect(await peer.next(/^REDACT /)).toBe("REDACT #bubble m3 :an edit of a message that is not yours");
        expect(await peer.next(MUTE_LINE)).toBe("SAMODE #bubble +b m:g1b");
        slow.open();
        await expect.poll(() => verdicts().length).toBe(5);
        expect(verdicts()).toContainEqual({ msgid: "m2", action: "pass", reason: null });
        await settle(peer);
        expect(mutes(peer)).toEqual(["SAMODE #bubble +b m:g1b"]);
      });
    });
  });

  describe("the rooms (3l)", () => {
    it("makes a moderator's room through the link: joined, open to accounts, and to all", async () => {
      const { peer, chat } = await linked({ worlds: worlds("bubble"), moderation: OFF });
      expect(chat.rooms.create("bubble", "garden")).toEqual({ made: "#bubble/garden" });
      expect(await peer.next(/^JOIN #bubble\/garden$/)).toBe("JOIN #bubble/garden");
      expect(await peer.next(/^SAMODE #bubble\/garden /)).toBe("SAMODE #bubble/garden +M");
      expect(await peer.next(/^SAMODE #bubble\/garden /)).toBe("SAMODE #bubble/garden -i");
    });

    it("puts each room's flags on with its JOINs, then as Ergo says it stands, each time it is in its rooms (3m)", async () => {
      const { peer, ergo, chat } = await linked({ worlds: worlds("bubble"), moderation: OFF });
      const flags = (lines: string[]) => lines.filter((l) => /^SAMODE #bubble\S* [+-][MmisR]$/.test(l));
      await peer.next(/^NAMES #bubble$/);
      peer.say(":ergo.test 324 gnoworld #bubble +nt");
      peer.say(":ergo.test 347 gnoworld #bubble :End");
      peer.say(":ergo.test 366 gnoworld #bubble :End");
      await expect.poll(() => flags(peer.lines)).toEqual(["SAMODE #bubble +M", "SAMODE #bubble +M"]);
      chat.rooms.create("bubble", "old");
      chat.rooms.archive("bubble", "old");
      peer.socket.destroy();
      const again = await ergo.peer(1);
      await welcome(again);
      for (const room of ["#bubble", "#bubble/old"]) {
        await again.next(new RegExp(`^NAMES ${room.replace("/", "\\/")}$`));
        again.say(`:ergo.test 324 gnoworld ${room} +nt`);
        again.say(`:ergo.test 347 gnoworld ${room} :End`);
        again.say(`:ergo.test 366 gnoworld ${room} :End`);
      }
      const each = ["SAMODE #bubble +M", "SAMODE #bubble/old +M", "SAMODE #bubble/old +m", "SAMODE #bubble/old +s"];
      // With the JOINs, before any state is read; then the same, since Ergo said none was on.
      await expect.poll(() => flags(again.lines)).toEqual([...each, ...each]);
      expect(again.lines.indexOf("SAMODE #bubble/old +s")).toBeLessThan(again.lines.indexOf("MODE #bubble"));
    });

    it("raises the alert for a channel in Ergo it did not make, and for no room it made, archived or open", async () => {
      const { peer, chat } = await linked({ worlds: worlds("bubble"), moderation: OFF });
      chat.rooms.create("bubble", "garden");
      chat.rooms.create("bubble", "old");
      chat.rooms.archive("bubble", "old");
      await peer.next(/^LIST$/);
      for (const name of ["#bubble", "#bubble/garden", "#bubble/old", "#rogue"]) {
        peer.say(`:ergo.test 322 gnoworld ${name} 1 :`);
      }
      peer.say(":ergo.test 323 gnoworld :End of /LIST");
      await expect
        .poll(() => logged.filter((l) => l.includes('"event":"alert"') && l.includes('"unknown_room"')))
        .toEqual([expect.stringContaining('"room":"#rogue"')]);
    });

    it("checks a new room's lines by its world's rules once the bot is in it, and counts them", async () => {
      const { peer, chat, rooms } = await linked(
        { worlds: worlds("bubble"), moderation: OFF },
        { provider: () => Promise.resolve(OFF_ANSWER) },
      );
      chat.rooms.create("bubble", "garden");
      await peer.next(/^JOIN #bubble\/garden$/);
      peer.say(":gnoworld!u@h JOIN #bubble/garden");
      peer.say(message("account=g1a;msgid=m1", "g1a!u@h", ["#bubble/garden", "buy spam"]));
      expect(await peer.next(/^REDACT /)).toBe("REDACT #bubble/garden m1 :a word this world bans");
      expect(await rooms("bubble")).toContain('{"world":"bubble","room":"#bubble/garden","perMinute":0.2}');
    });

    it("puts a live mute on a room made while it lasts", async () => {
      const { peer, chat } = await linked(
        { worlds: worlds("bubble"), moderation: OFF },
        {
          provider: (text) =>
            Promise.resolve(
              text.includes("hurt")
                ? { ...OFF_ANSWER, flagged: { ...OFF_ANSWER.flagged, violence: true } }
                : OFF_ANSWER,
            ),
        },
      );
      for (let n = 1; n <= 3; n += 1)
        peer.say(message(`account=g1a;msgid=m${String(n)}`, "g1a!u@h", ["#bubble", "hurt"]));
      await peer.next(/^SAMODE #bubble \+b m:g1a$/);
      chat.rooms.create("bubble", "garden");
      expect(await peer.next(/^SAMODE #bubble\/garden \+b /)).toBe("SAMODE #bubble/garden +b m:g1a");
    });

    it("puts its world's live mutes on a room made, and sends no other room anything (F588)", async () => {
      const { peer, chat } = await linked(
        { worlds: worlds("bubble", "earth"), moderation: OFF },
        { provider: () => Promise.resolve({ ...OFF_ANSWER, flagged: { ...OFF_ANSWER.flagged, violence: true } }) },
      );
      for (const [who, room] of [
        ["g1a", "#bubble"],
        ["g1b", "#earth"],
      ] as const)
        for (let n = 1; n <= 3; n += 1)
          peer.say(message(`account=${who};msgid=${who}${String(n)}`, `${who}!u@h`, [room, "hurt"]));
      await peer.next(/^SAMODE #bubble \+b m:g1a$/);
      await peer.next(/^SAMODE #earth \+b m:g1b$/);
      const mark = peer.lines.length;
      chat.rooms.create("bubble", "garden");
      peer.say("PING :settled");
      await peer.next(/^PONG settled$/);
      expect(peer.lines.slice(mark).filter((l) => MUTE_LINE.test(l))).toEqual(["SAMODE #bubble/garden +b m:g1a"]);
    });

    it("puts no mute on again for a room it refuses to make: a name taken, a name too long (F563)", async () => {
      const { peer, chat } = await linked(
        { worlds: worlds("bubble"), moderation: OFF },
        { provider: () => Promise.resolve({ ...OFF_ANSWER, flagged: { ...OFF_ANSWER.flagged, violence: true } }) },
      );
      for (let n = 1; n <= 3; n += 1)
        peer.say(message(`account=g1a;msgid=m${String(n)}`, "g1a!u@h", ["#bubble", "hurt"]));
      await peer.next(/^SAMODE #bubble \+b m:g1a$/);
      chat.rooms.create("bubble", "garden");
      await peer.next(/^SAMODE #bubble\/garden \+b /);
      const mark = peer.lines.length;
      expect([chat.rooms.create("bubble", "garden"), chat.rooms.create("bubble", "x".repeat(60))]).toEqual([
        "exists",
        "too_long",
      ]);
      peer.say("PING :settled");
      await peer.next(/^PONG settled$/);
      expect(peer.lines.slice(mark).filter((l) => MUTE_LINE.test(l))).toEqual([]);
    });
  });

  describe("rooms by role (3m)", () => {
    const MOD = "g1zgldsmn6ck6w4p325xd3j8y779ky6fpjnz3uh9";
    const MEMBER = "g1m68zzc430znqyxzv6jsfz45hgccacx3mk6qajw";
    const WRITER = "g10gh7yq7swv77efwfcqy2znp37cmeughxx3y5tv";
    const roled = () =>
      new Map([
        [
          "bubble",
          {
            rules: RULES,
            moderators: new Set([MOD]),
            groups: new Map([
              ["crew", new Set([MEMBER])],
              ["pens", new Set([WRITER])],
            ]),
            rooms: new Map<string, Room>([
              ["#bubble/crew", { type: "members" as const, readers: "crew", hidden: false }],
              ["#bubble/desk", { type: "members-write" as const, readers: "crew", writers: "pens", hidden: false }],
            ]),
          },
        ],
      ]);
    // Every line before this one has been read by the link.
    const settle = async (peer: { say: (l: string) => void; next: (p: RegExp) => Promise<string> }) => {
      peer.say("PING :settled");
      await peer.next(/^PONG settled$/);
    };
    // Ergo's answers to the bot's three questions on a room's state.
    const answer = async (
      peer: Awaited<ReturnType<typeof fakeErgo>>["peers"][number],
      room: string,
      names = "~@gnoworld",
    ) => {
      await peer.next(new RegExp(`^NAMES ${room.replace("/", "\\/")}$`));
      peer.say(`:ergo.test 324 gnoworld ${room} +nt`);
      peer.say(`:ergo.test 347 gnoworld ${room} :End`);
      peer.say(`:ergo.test 353 gnoworld = ${room} :${names}`);
      peer.say(`:ergo.test 366 gnoworld ${room} :End`);
    };

    it("makes the roles file's rooms at start, joins them, and sets each as its type says", async () => {
      const { peer, db } = await linked({ worlds: roled(), moderation: OFF, team: new Set<string>() });
      expect(listRooms(db).map(({ name }) => name)).toEqual(["#bubble", "#bubble/crew", "#bubble/desk"]);
      for (const room of ["#bubble", "#bubble/crew", "#bubble/desk"]) await answer(peer, room);
      // Its flags with the JOINs, then as Ergo said it stands (+nt): the flags again, and the invites.
      await expect
        .poll(() => peer.lines.filter((l) => /^SAMODE #bubble\/crew [+-]/.test(l)))
        .toEqual([
          "SAMODE #bubble/crew +M",
          "SAMODE #bubble/crew +i",
          "SAMODE #bubble/crew +M",
          "SAMODE #bubble/crew +i",
          `SAMODE #bubble/crew +I ${MEMBER}`,
          `SAMODE #bubble/crew +I ${MOD}`,
        ]);
      expect(peer.lines.filter((l) => /^SAMODE #bubble [+-][^b]/.test(l))).toEqual([
        "SAMODE #bubble +M",
        "SAMODE #bubble +M",
      ]);
    });

    it("voices a writer who joins a members-write room, at once", async () => {
      const { peer } = await linked({ worlds: roled(), moderation: OFF });
      for (const room of ["#bubble", "#bubble/crew", "#bubble/desk"]) await answer(peer, room);
      peer.say(`@account=${WRITER} :${WRITER}!u@h JOIN #bubble/desk ${WRITER} :w`);
      await answer(peer, "#bubble/desk", `~@gnoworld ${WRITER}`);
      expect(await peer.next(/^SAMODE #bubble\/desk \+v /)).toBe(`SAMODE #bubble/desk +v ${WRITER}`);
    });

    it("sends no members room's line to the provider, its rules still hiding", async () => {
      const asked: string[] = [];
      const { peer, verdicts } = await linked(
        { worlds: roled(), moderation: OFF },
        {
          provider: (text) => {
            asked.push(text);
            return Promise.resolve(OFF_ANSWER);
          },
        },
      );
      peer.say(":gnoworld!u@h JOIN #bubble/crew");
      peer.say(message(`account=${MEMBER};msgid=m1`, `${MEMBER}!u@h`, ["#bubble/crew", "between us"]));
      peer.say(message(`account=${MEMBER};msgid=m2`, `${MEMBER}!u@h`, ["#bubble", "in the open"]));
      await expect.poll(() => verdicts().length).toBe(2);
      expect(asked).toEqual(["in the open"]);
    });

    it("answers a members room's activity to its members alone", async () => {
      const { app } = setup(
        { worlds: roled(), moderation: OFF, ergo: undefined },
        { session: (token) => (token === "member" ? MEMBER : undefined) },
      );
      const rooms = async (who?: string) =>
        (
          await app.request("/api/activity?worlds=bubble", {
            headers: who === undefined ? {} : { cookie: `__Host-session=${who}` },
          })
        ).text();
      expect(await rooms()).not.toContain("#bubble/crew");
      expect(await rooms("member")).toContain("#bubble/crew");
    });

    it("leaves an archived room read-only and unlisted, sending it nothing once Ergo has it so", async () => {
      const { peer, chat, ergo } = await linked({ worlds: roled(), moderation: OFF });
      for (const room of ["#bubble", "#bubble/crew", "#bubble/desk"]) await answer(peer, room);
      chat.rooms.create("bubble", "old");
      chat.rooms.archive("bubble", "old");
      await settle(peer);
      peer.socket.destroy();
      const again = await ergo.peer(1);
      await welcome(again);
      for (const room of ["#bubble", "#bubble/crew", "#bubble/desk"]) await answer(again, room);
      await again.next(/^NAMES #bubble\/old$/);
      const mark = again.lines.length;
      again.say(":ergo.test 324 gnoworld #bubble/old +Mmsnt");
      again.say(":ergo.test 347 gnoworld #bubble/old :End");
      again.say(":ergo.test 366 gnoworld #bubble/old :End");
      await settle(again);
      expect(again.lines.slice(mark).filter((l) => l.startsWith("SAMODE #bubble/old"))).toEqual([]);
    });

    it("lists a hidden room to its world's moderators and the team, a members room to its members, never to a stranger", async () => {
      const tokens = new Map([
        ["mod", MOD],
        ["member", MEMBER],
        ["stranger", "g1uauvt7txunf9zeu2qyrzv0pa5uvwjlq90r3qpa"],
        ["team", "g1jg8mtutu9khhfwc4nxmuhcpftf0pajdhfvsqf5"],
      ]);
      const hidden = roled();
      hidden.get("bubble")?.rooms.set("#bubble/attic", { type: "accounts" as const, hidden: true });
      const { app } = setup(
        {
          worlds: hidden,
          moderation: OFF,
          ergo: undefined,
          team: new Set(["g1jg8mtutu9khhfwc4nxmuhcpftf0pajdhfvsqf5"]),
        },
        { session: (token) => tokens.get(token ?? "") },
      );
      const listed = async (who?: string) => {
        const headers = who === undefined ? {} : { cookie: `__Host-session=${who}` };
        const text = await (await app.request("/api/activity?worlds=bubble", { headers })).text();
        return ["#bubble/attic", "#bubble/crew"].filter((room) => text.includes(`"${room}"`));
      };
      expect([
        await listed(),
        await listed("stranger"),
        await listed("member"),
        await listed("mod"),
        await listed("team"),
      ]).toEqual([[], [], ["#bubble/crew"], ["#bubble/attic", "#bubble/crew"], ["#bubble/attic", "#bubble/crew"]]);
    });

    it("reads a room again on a JOIN only when its type voices someone, never an open room's (F582)", async () => {
      const { peer } = await linked({ worlds: roled(), moderation: OFF });
      for (const room of ["#bubble", "#bubble/crew", "#bubble/desk"]) await answer(peer, room);
      const mark = peer.lines.length;
      peer.say(`@account=${MEMBER} :${MEMBER}!u@h JOIN #bubble ${MEMBER} :m`);
      peer.say(`@account=${MEMBER} :${MEMBER}!u@h JOIN #bubble/desk ${MEMBER} :m`);
      await answer(peer, "#bubble/desk", `~@gnoworld ${MEMBER}`);
      await settle(peer);
      expect(peer.lines.slice(mark).filter((l) => l.startsWith("MODE "))).toEqual(["MODE #bubble/desk"]);
    });

    it("takes every voice of a room it archives at once, rather than at the next minute's pass (F580)", async () => {
      const { peer, chat } = await linked({ worlds: roled(), moderation: OFF });
      for (const room of ["#bubble", "#bubble/crew", "#bubble/desk"]) await answer(peer, room);
      expect(chat.rooms.archive("bubble", "desk")).toBe("archived");
      await answer(peer, "#bubble/desk", `~@gnoworld +${WRITER}`);
      expect(await peer.next(/^SAMODE #bubble\/desk -v /)).toBe(`SAMODE #bubble/desk -v ${WRITER}`);
    });

    it("runs its passes with no Ergo set, and logs no room as failed for it (F578)", async () => {
      vi.useFakeTimers();
      try {
        setup({ worlds: roled(), moderation: OFF, ergo: undefined });
        await vi.advanceTimersByTimeAsync(3 * MINUTE);
        expect(logged.filter((line) => line.includes("room_unreconciled"))).toEqual([]);
      } finally {
        vi.useRealTimers();
      }
    });

    it("lists an archived room as a hidden one: to its world's moderators and the team alone (F576)", async () => {
      const tokens = new Map([
        ["mod", MOD],
        ["stranger", "g1uauvt7txunf9zeu2qyrzv0pa5uvwjlq90r3qpa"],
      ]);
      const { app, chat } = setup(
        { worlds: roled(), moderation: OFF, ergo: undefined },
        { session: (token) => tokens.get(token ?? "") },
      );
      chat.rooms.create("bubble", "old");
      chat.rooms.create("bubble", "garden");
      chat.rooms.archive("bubble", "old");
      const listed = async (who?: string) => {
        const headers = who === undefined ? {} : { cookie: `__Host-session=${who}` };
        const text = await (await app.request("/api/activity?worlds=bubble", { headers })).text();
        return ["#bubble/garden", "#bubble/old"].filter((room) => text.includes(`"${room}"`));
      };
      expect([await listed(), await listed("stranger"), await listed("mod")]).toEqual([
        ["#bubble/garden"],
        ["#bubble/garden"],
        ["#bubble/garden", "#bubble/old"],
      ]);
    });

    it("voices no one else on a JOIN: a reader who is no writer, a guest, the bot itself, anyone in an open room", async () => {
      const { peer } = await linked({ worlds: roled(), moderation: OFF });
      for (const room of ["#bubble", "#bubble/crew", "#bubble/desk"]) await answer(peer, room);
      peer.say(`@account=${MEMBER} :${MEMBER}!u@h JOIN #bubble/desk ${MEMBER} :m`);
      await answer(peer, "#bubble/desk", `~@gnoworld ${MEMBER}`);
      peer.say(":gus!u@h JOIN #bubble/desk * :guest");
      peer.say(":gnoworld!u@h JOIN #bubble/desk");
      peer.say(`@account=${WRITER} :${WRITER}!u@h JOIN #bubble ${WRITER} :w`);
      await settle(peer);
      expect(peer.lines.filter((l) => /^SAMODE \S+ \+v /.test(l))).toEqual([]);
    });
  });
});

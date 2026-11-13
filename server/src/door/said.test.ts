import type { DatabaseSync } from "node:sqlite";
import { Address, shortAddress, type JarvisAnswer } from "@gnoworld/schemas";
import { openDatabase } from "@gnoworld/service/db";
import { logger } from "@gnoworld/service/log";
import { afterEach, describe, expect, it } from "vitest";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { makeApp } from "../app.ts";
import { allowed } from "../irc/lines.ts";
import { KEEP_MS } from "../cards/expire.ts";
import type { Relayed } from "../irc/relay.ts";
import { CATEGORIES, type Answer } from "../moderation/provider.ts";
import type { Rules } from "../roles/roles.ts";
import { guestRules } from "../guest/rules.ts";
import { makeSaid, saidRoutes, SAID_TABLES, type Offered } from "./said.ts";

// Jarvis's public answers: judged like a guest's line, relayed under one fixed nick, kept by msgid, read back for readers alone.
const T0 = Date.parse("2026-11-13T12:00:00.000Z");
const ORIGIN = "https://gnoworld.test";
const PEPPER = "a-pepper-of-forty-characters-0123456789";
const ANNA = Address.parse("g1jg8mtutu9khhfwc4nxmuhcpftf0pajdhfvsqf5");
const BEN = Address.parse("g10gh7yq7swv77efwfcqy2znp37cmeughxx3y5tv");
const TOKENS = new Map<string, Address>([
  ["anna-token-of-forty-three-characters-000000", ANNA],
  ["ben-token-of-forty-three-characters-0000000", BEN],
]);
const ANNA_TOKEN = "anna-token-of-forty-three-characters-000000";
const BEN_TOKEN = "ben-token-of-forty-three-characters-0000000";
const NICK = "jarvis/bot";
const SHORT_ANNA = shortAddress(ANNA);
const DEFAULTS: Rules = { bannedWords: ["scam"], linksPerMessage: 3, mentionsPerMessage: 5, linksForNewAccount: 2 };
const NOTHING: Answer = {
  flagged: Object.fromEntries(CATEGORIES.map((each) => [each, false])) as Answer["flagged"],
  scores: Object.fromEntries(CATEGORIES.map((each) => [each, 0])) as Answer["scores"],
};
const HATE: Answer = { flagged: { ...NOTHING.flagged, hate: true }, scores: { ...NOTHING.scores, hate: 0.9 } };
const answer = (markdown: string): Offered["answer"] => ({ status: "answered", markdown, buttons: [] });
const offered = (markdown: string, over: Partial<Offered> = {}): Offered => ({
  room: "#bubble",
  who: ANNA,
  started: T0,
  question: "what did they decide?",
  answer: answer(markdown),
  ...over,
});

const fly = (label: string, place = "/w/bubble") => ({ type: "fly" as const, label, place });
const act = (label: string, why = "Vote on the poll") => ({
  type: "action" as const,
  label,
  action: { realm: "gno.land/r/demo/boards", function: "CreateThread", args: {}, why },
});
const withButtons = (markdown: string, buttons: Offered["answer"]["buttons"]): Offered["answer"] => ({
  ...answer(markdown),
  buttons,
});

const opened: DatabaseSync[] = [];
afterEach(() => {
  for (const db of opened.splice(0)) db.close();
});

interface Options {
  provider?: ((text: string) => Promise<Answer | "unchecked">) | undefined;
  relayed?: Relayed;
  maxRows?: number;
  maxBytes?: number;
  relay?: (room: string, nick: string, text: string) => Promise<Relayed>;
  rules?: Rules | undefined;
  on?: boolean;
  path?: string;
}

const setup = (options: Options = {}) => {
  const { relayed, maxRows, maxBytes, on = true, path = ":memory:" } = options;
  // A key given as undefined means no provider: a destructuring default would take it for a missing one.
  const provider = "provider" in options ? options.provider : () => Promise.resolve(NOTHING);
  const db = openDatabase(path, [SAID_TABLES]);
  opened.push(db);
  const clock = { now: T0 };
  const relays: [string, string, string][] = [];
  const checks: string[] = [];
  let ids = 0;
  const lines: string[] = [];
  const said = makeSaid(db, {
    now: () => clock.now,
    log: logger(PEPPER, (line) => lines.push(line)),
    isPublic: (room) => room !== "#bubble/crew",
    rulesOf: () => ("rules" in options ? options.rules : guestRules(undefined, DEFAULTS)),
    provider:
      provider === undefined
        ? undefined
        : (text) => {
            checks.push(text);
            return provider(text);
          },
    thresholds: {},
    relay: (room, nick, text) => {
      relays.push([room, nick, text]);
      if (options.relay !== undefined) return options.relay(room, nick, text);
      ids += 1;
      return Promise.resolve(relayed ?? { msgid: `m${String(ids)}` });
    },
    hosts: ["gno.land", "gnoworld.test"],
    ...(maxRows === undefined ? {} : { maxRows }),
    ...(maxBytes === undefined ? {} : { maxBytes }),
  });
  const app = makeApp(
    logger(PEPPER, () => undefined),
    () => true,
  );
  app.route(
    "/api/jarvis",
    saidRoutes({
      session: (token) => TOKENS.get(token ?? ""),
      origins: [ORIGIN],
      on,
      log: logger(PEPPER, () => undefined),
      now: () => clock.now,
      mayRead: (room, who) => room !== "#bubble/crew" || who === BEN,
      said,
    }),
  );
  const read = (room: string, msgid: string, token: string | null = ANNA_TOKEN) =>
    app.request(
      `/api/jarvis/said?room=${encodeURIComponent(room)}&id=${encodeURIComponent(msgid)}`,
      { headers: token === null ? {} : { cookie: `__Host-session=${token}` } },
      { incoming: { socket: { remoteAddress: "203.0.113.7" } } },
    );
  return { said, app, read, clock, relays, checks, db };
};

describe("an answer made public", () => {
  it("is relayed once under jarvis/bot as a plain excerpt and kept by msgid", async () => {
    const { said, relays } = setup();
    const markdown = "It closes **today**. See the *poll* for more.";
    const full: JarvisAnswer = answer(markdown);
    expect(await said.offer(offered(markdown))).toBe("public");
    expect(relays).toEqual([["#bubble", NICK, "It closes today. See the poll for more."]]);
    expect(said.get("#bubble", "m1")).toEqual(full);
    expect(said.get("#other", "m1")).toBeUndefined();
  });

  it("keeps the excerpt to 280 characters and one line", async () => {
    const { said, relays } = setup();
    await said.offer(offered(`${"word ".repeat(200)}\n\nsecond paragraph`));
    const text = relays[0]?.[2] ?? "";
    expect(Array.from(text).length).toBeLessThanOrEqual(280);
    expect(text).not.toMatch(/[\n\r]/);
    expect(text.length).toBeGreaterThan(0);
  });

  it("may name the door's own hosts, and the provider reads the full text", async () => {
    const { said, relays, checks } = setup();
    const text = "Read [the board](https://gno.land/r/demo/boards) first.";
    expect(await said.offer(offered(text))).toBe("public");
    expect(relays).toEqual([["#bubble", NICK, "Read the board first."]]);
    expect(checks).toContain(text);
  });
});

describe("a refused answer", () => {
  it("leaves the private card", async () => {
    const { said, relays } = setup();
    expect(await said.offer(offered("this is a scam", { started: T0 + 5 }))).toBe("private");
    expect(relays).toEqual([]);
    expect(said.get("#bubble", "m1")).toBeUndefined();
  });

  it("with a foreign link, a mention or a banned word is not relayed", async () => {
    const { said, relays } = setup();
    expect(await said.offer(offered("fine words"))).toBe("public");
    const bad = [
      "see [this](https://evil.test/a)",
      "see https://evil.test/a",
      "see www.evil.test",
      "hello @alice and @bob",
      "a perfect scam",
    ];
    for (const markdown of bad) expect(await said.offer(offered(markdown))).toBe("private");
    expect(relays).toHaveLength(1);
  });

  it("is kept private when the provider flags it or fails", async () => {
    const flagged = setup({ provider: () => Promise.resolve(HATE) });
    expect(await flagged.said.offer(offered("something hateful"))).toBe("private");
    expect(flagged.relays).toEqual([]);
    const failing = setup({ provider: () => Promise.resolve("unchecked") });
    expect(await failing.said.offer(offered("fine"))).toBe("private");
    const none = setup({ provider: undefined });
    expect(await none.said.offer(offered("fine"))).toBe("private");
    expect([failing.relays, none.relays]).toEqual([[], []]);
    const control = setup();
    expect(await control.said.offer(offered("fine"))).toBe("public");
  });

  it("stays private when the relay is refused or unsure, and keeps nothing", async () => {
    const refused = setup({ relayed: false });
    expect(await refused.said.offer(offered("fine"))).toBe("private");
    const unsure = setup({ relayed: "unsure" });
    expect(await unsure.said.offer(offered("fine"))).toBe("private");
    expect([refused.said.get("#bubble", "m1"), unsure.said.get("#bubble", "m1")]).toEqual([undefined, undefined]);
    expect(await setup().said.offer(offered("fine"))).toBe("public");
  });
});

describe("an answer's buttons, said to every reader", () => {
  it("keep only the fly ones: an action button stays on the asker's private card", async () => {
    const { said, read } = setup();
    const buttons = [fly("Go there"), act("Vote")];
    expect(await said.offer(offered("fine", { answer: withButtons("fine", buttons) }))).toBe("public");
    expect(said.get("#bubble", "m1")).toEqual(withButtons("fine", [fly("Go there")]));
    expect(await (await read("#bubble", "m1")).json()).toMatchObject({
      answer: withButtons("fine", [fly("Go there")]),
    });
  });

  it.each([
    ["a banned word", "a scam"],
    ["a link", "see https://evil.test"],
    ["a mention", "@everyone"],
    ["a hidden character", "go\u202e there"],
  ])("with a fly label holding %s is not relayed", async (_name, label) => {
    const { said, relays } = setup();
    expect(await said.offer(offered("fine", { answer: withButtons("fine", [fly(label)]) }))).toBe("private");
    expect([relays, said.get("#bubble", "m1")]).toEqual([[], undefined]);
  });

  it("have their labels read by the provider with the answer, in one call", async () => {
    const { said, checks } = setup();
    await said.offer(offered("fine words", { answer: withButtons("fine words", [fly("Go there"), act("Vote")]) }));
    expect(checks).toHaveLength(1);
    expect(checks[0]).toContain("fine words");
    expect(checks[0]).toContain("Go there");
  });

  it("are not judged for an action's words, which are never kept", async () => {
    const { said } = setup();
    const buttons = [act("scam https://evil.test @everyone", "Official airdrop, visit https://evil.test now")];
    expect(await said.offer(offered("fine", { answer: withButtons("fine", buttons) }))).toBe("public");
    expect(said.get("#bubble", "m1")).toEqual(withButtons("fine", []));
  });
});

describe("one account's public answers", () => {
  it("cannot fill a room's allowance: its second answer in a room within a minute stays private", async () => {
    const { said, relays } = setup();
    const results: string[] = [];
    for (const who of [ANNA, ANNA, ANNA, "g1b", "g1c", "g1d"]) results.push(await said.offer(offered("fine", { who })));
    expect(results).toEqual(["public", "private", "private", "public", "public", "private"]);
    expect(relays).toHaveLength(3);
  });
});

describe("a members room's answer", () => {
  it("is not relayed nor sent to the provider", async () => {
    const { said, relays, checks } = setup();
    expect(await said.offer(offered("fine", { room: "#bubble/crew" }))).toBe("private");
    expect([relays, checks]).toEqual([[], []]);
    expect(await said.offer(offered("fine"))).toBe("public");
  });
});

describe("the public answers' allowances", () => {
  it("let a room have three a minute: the fourth stays private, and the next minute is free", async () => {
    const { said, relays, clock } = setup();
    const accounts = ["g1a", "g1b", "g1c", "g1d"];
    const results: string[] = [];
    for (const who of accounts) results.push(await said.offer(offered("fine", { who })));
    expect(results).toEqual(["public", "public", "public", "private"]);
    expect(relays).toHaveLength(3);
    clock.now += 60_000;
    expect(await said.offer(offered("fine", { who: "g1d" }))).toBe("public");
  });

  it("let an account have six a minute across rooms", async () => {
    const { said, relays } = setup();
    const results: string[] = [];
    for (let at = 0; at < 7; at += 1) results.push(await said.offer(offered("fine", { room: `#room${String(at)}` })));
    expect(results.slice(0, 6)).toEqual(Array<string>(6).fill("public"));
    expect(results[6]).toBe("private");
    expect(relays).toHaveLength(6);
  });

  it("are taken before the first await: four offers at once relay three", async () => {
    const { said, relays } = setup();
    const all = await Promise.all(["g1a", "g1b", "g1c", "g1d"].map((who) => said.offer(offered("fine", { who }))));
    expect(all.filter((each) => each === "public")).toHaveLength(3);
    expect(relays).toHaveLength(3);
  });
});

describe("the kept answers", () => {
  it("name their asker by its short address, never the whole one", async () => {
    const { said, read } = setup();
    await said.offer(offered("It closes today."));
    const body = JSON.stringify(await (await read("#bubble", "m1", BEN_TOKEN)).json());
    expect(body).toContain(SHORT_ANNA);
    expect(body).not.toContain(ANNA);
    expect(said.asker("#bubble", "m1")).toBe(SHORT_ANNA);
  });

  it("are gone once their line is dropped, and the route answers 404", async () => {
    const { said, read } = setup();
    await said.offer(offered("It closes today."));
    expect((await read("#bubble", "m1")).status).toBe(200);
    said.drop("#bubble", "m1");
    expect(said.get("#bubble", "m1")).toBeUndefined();
    const gone = await read("#bubble", "m1");
    expect([gone.status, await gone.json()]).toEqual([404, { error: "not_found" }]);
  });

  it("are read by a member as the answer, never by one who may not read the room, nor for an unknown line", async () => {
    const { said, read } = setup();
    await said.offer(offered("It closes today."));
    const seen = await read("#bubble", "m1", BEN_TOKEN);
    expect([seen.status, await seen.json()]).toEqual([200, { answer: answer("It closes today."), asker: SHORT_ANNA }]);
    expect((await read("#bubble", "m9")).status).toBe(404);
    expect((await read("#bubble", "m1", null)).status).toBe(401);
  });

  it("are not read from a members room by one who may not read it, though the row exists", async () => {
    const { said, read, db } = setup();
    await said.offer(offered("It closes today."));
    expect(said.get("#bubble", "m1")).toBeDefined();
    db.exec("UPDATE jarvis_said SET room = '#bubble/crew'");
    expect((await read("#bubble/crew", "m1", ANNA_TOKEN)).status).toBe(404);
    expect((await read("#bubble/crew", "m1", BEN_TOKEN)).status).toBe(200);
  });

  it("go with the cards' retention: 30 days, then the oldest past the row cap", async () => {
    const { said, clock } = setup({ maxRows: 2 });
    await said.offer(offered("one", { who: "g1a" }));
    clock.now += KEEP_MS - 1;
    expect(said.expire(100)).toBe(0);
    expect(said.get("#bubble", "m1")).toBeDefined();
    clock.now += 2;
    expect(said.expire(100)).toBe(1);
    expect(said.get("#bubble", "m1")).toBeUndefined();
    for (const [at, who] of ["g1a", "g1b", "g1c"].entries()) {
      clock.now += 1;
      await said.offer(offered(`text ${String(at)}`, { who, room: `#r${String(at)}` }));
    }
    expect(said.expire(100)).toBe(1);
  });
});

describe("the routes", () => {
  it("relay no client's text: nothing but the kept answer is read, and nothing writes", async () => {
    const { said, app, read, relays } = setup();
    await said.offer(offered("It closes today."));
    expect((await read("#bubble", "m1")).status).toBe(200);
    const before = relays.length;
    for (const path of ["/api/jarvis/said", "/api/jarvis/said/relay", "/api/jarvis/say"])
      for (const method of ["POST", "PUT"]) {
        const response = await app.request(
          path,
          {
            method,
            headers: { origin: ORIGIN, "content-type": "application/json", cookie: `__Host-session=${ANNA_TOKEN}` },
            body: JSON.stringify({ room: "#bubble", text: "say this" }),
          },
          { incoming: { socket: { remoteAddress: "203.0.113.7" } } },
        );
        expect(response.status).toBeGreaterThanOrEqual(400);
      }
    expect(relays).toHaveLength(before);
  });
});

const deferred = <T>() => {
  let resolve!: (value: T) => void;
  const promise = new Promise<T>((done) => {
    resolve = done;
  });
  return { promise, resolve };
};
const pad = "clean words ".repeat(30);

describe("a fault in one part of an answer", () => {
  it("only in the excerpt (a word the markdown breaks up) keeps it private", async () => {
    const { said, relays } = setup();
    expect(await said.offer(offered("a perfect sc**am**"))).toBe("private");
    expect(relays).toEqual([]);
  });

  it.each([
    ["a banned word", `${pad}scam`],
    ["a foreign link", `${pad}[x](https://evil.test)`],
    ["a mention", `${pad}@alice @bob`],
  ])("only past the excerpt's cut (%s) keeps it private", async (_name, markdown) => {
    const { said, relays } = setup();
    expect(await said.offer(offered(markdown))).toBe("private");
    expect(relays).toEqual([]);
  });

  it.each([
    ["a mention", "hello @alice and @bob"],
    ["a single mention", "ask @alice"],
    ["a banned word", "a scam"],
    ["a foreign link", "see [this](https://evil.test/a)"],
    ["a bare link, even to a host", "see https://gno.land/r/demo"],
    ["control characters", "hi\u0001ACTION x"],
  ])("with %s says nothing", async (_name, markdown) => {
    const { said, relays } = setup();
    expect(await said.offer(offered(markdown))).toBe("private");
    expect(relays).toEqual([]);
  });
});

describe("the links an answer may hold", () => {
  it.each([
    "https://gno.land.evil.test/",
    "https://evil.test/?gno.land",
    "https://gno.land@evil.test/",
    "https://evilgno.land",
    "https://gno.land:pw@gno.land/",
    "HTTPS://EVIL.TEST",
    "http://gno.land/r/x",
    "javascript:alert(1)",
    "evil.test",
    "//evil.test",
    "data:text/html,x",
    "/r/demo/boards",
  ])("a link [x](%s) is not relayed", async (target) => {
    const { said, relays } = setup();
    expect(await said.offer(offered(`see [x](${target})`))).toBe("private");
    expect(relays).toEqual([]);
  });

  it.each([
    "![](https://gno.land/p.png)",
    "[a][1]\n\n[1]: https://evil.test",
    "[1]: evil.test",
    "<evil.test>",
    "<https://evil.test>",
    "discord.gg/x",
    "see www.evil.test",
    "a [link](https://gno.land/a) and https://evil.test/b",
    "[https://evil.test](https://gno.land/a)",
    "[a](https://gno.land/a) [b](https://gno.land/b) [c](https://gno.land/c) [d](https://gno.land/d)",
  ])("the shape %j is not relayed", async (markdown) => {
    const { said, relays } = setup();
    expect(await said.offer(offered(markdown))).toBe("private");
    expect(relays).toEqual([]);
  });

  it("a link to a subdomain of a host or to the door's own site is relayed as its text", async () => {
    const { said, relays } = setup();
    const markdown = "See [the docs](https://docs.gno.land/x) and [us](https://gnoworld.test/y).";
    expect(await said.offer(offered(markdown))).toBe("public");
    expect(relays).toEqual([["#bubble", NICK, "See the docs and us."]]);
  });
});

describe("the excerpt's size and characters", () => {
  it.each([
    ["CJK", "字"],
    ["emoji", String.fromCodePoint(0x1f600)],
  ])("of 300 %s characters is cut under 400 bytes and the relay's form takes it", async (_name, each) => {
    const { said, relays } = setup();
    expect(await said.offer(offered(each.repeat(300)))).toBe("public");
    const [room, nick, text] = [relays[0]?.[0] ?? "", relays[0]?.[1] ?? "", relays[0]?.[2] ?? ""];
    expect(Buffer.byteLength(text)).toBeLessThanOrEqual(400);
    expect(text.endsWith("…")).toBe(true);
    expect(allowed("RELAYMSG", [room, nick, text])).toBe(true);
  });

  it("is cut at a word, and keeps a short answer whole", async () => {
    const { said, relays } = setup();
    await said.offer(offered("alpha ".repeat(100)));
    await said.offer(offered("short and sweet", { who: "g1b" }));
    expect(relays[0]?.[2]).toMatch(/^(alpha )*alpha…$/);
    expect(relays[1]?.[2]).toBe("short and sweet");
  });

  it.each(["", "   ", "****", "```\n```"])("of nothing (%j) is private", async (markdown) => {
    const { said, relays } = setup();
    expect(await said.offer(offered(markdown))).toBe("private");
    expect(relays).toEqual([]);
  });

  it.each([
    "a\u0003b",
    "a\u202eb",
    "a\ud800b",
    "a\u0000b",
    "a\u200bb",
    "a\u200cb",
    "a\u200db",
    "a\u200eb",
    "a\u200fb",
    "a\u061cb",
    "a\u2060b",
    "a\ufeffb",
  ])("with the character %j is private", async (markdown) => {
    const { said, relays } = setup();
    expect(await said.offer(offered(markdown))).toBe("private");
    expect(relays).toEqual([]);
  });

  it("with a tab or a line break inside is flattened to one line", async () => {
    const { said, relays } = setup();
    expect(await said.offer(offered("a\tb\n\n- c\n- d"))).toBe("public");
    expect(relays[0]?.[2]).toBe("a b c d");
  });

  it("past the answer's cap is private", async () => {
    const { said, relays } = setup();
    expect(await said.offer(offered("a".repeat(8001)))).toBe("private");
    expect(await said.offer(offered("a".repeat(100_000)))).toBe("private");
    expect(relays).toEqual([]);
  });
});

describe("the allowances", () => {
  it("a fourth answer in a room spends none of the account's six", async () => {
    const { said, relays } = setup();
    for (const who of ["g1a", "g1b", "g1c"]) await said.offer(offered("fine", { who }));
    expect(await said.offer(offered("fine", { who: "g1d" }))).toBe("private");
    for (let at = 0; at < 6; at += 1) {
      const room = `#r${String(at)}`;
      expect(await said.offer(offered("fine", { who: "g1d", room }))).toBe("public");
    }
    expect(relays).toHaveLength(9);
  });
});

describe("a fault of the machinery", () => {
  it.each([
    ["a relay that rejects", { relay: () => Promise.reject(new Error("down")) }],
    ["a provider that rejects", { provider: () => Promise.reject(new Error("down")) }],
    ["no rules for the room", { rules: undefined }],
    ["a relay with no id", { relayed: { msgid: "" } as Relayed }],
  ])("%s keeps the answer private and keeps nothing", async (_name, options: Options) => {
    const { said } = setup(options);
    expect(await said.offer(offered("fine"))).toBe("private");
    expect(said.get("#bubble", "m1")).toBeUndefined();
    expect(said.get("#bubble", "")).toBeUndefined();
  });

  it("a table that cannot be written keeps the answer private, with no rejection", async () => {
    const { said, db } = setup();
    db.exec("DROP TABLE jarvis_said");
    expect(await said.offer(offered("fine"))).toBe("private");
  });

  it("a line taken while its relay is waiting is never kept", async () => {
    const wait = deferred<Relayed>();
    const { said } = setup({ relay: () => wait.promise });
    const pending = said.offer(offered("fine"));
    said.drop("#bubble", "m1");
    wait.resolve({ msgid: "m1" });
    expect(await pending).toBe("private");
    expect(said.get("#bubble", "m1")).toBeUndefined();
  });
});

describe("an answer's size and shape as read", () => {
  it("never carries a field the call's answer held besides its own three", async () => {
    const { said, read } = setup();
    const paid = { ...answer("It closes today."), cost: 1234, made: true } as Offered["answer"];
    await said.offer(offered("It closes today.", { answer: paid }));
    const body = await (await read("#bubble", "m1")).json();
    expect(body).toEqual({ answer: answer("It closes today."), asker: SHORT_ANNA });
  });

  it("is kept across a restart, in a file's database", async () => {
    const dir = mkdtempSync(join(tmpdir(), "said-"));
    try {
      const path = join(dir, "db.sqlite");
      const first = setup({ path });
      await first.said.offer(offered("It closes today."));
      first.db.close();
      opened.splice(opened.indexOf(first.db), 1);
      const second = setup({ path });
      expect(second.said.get("#bubble", "m1")).toEqual(answer("It closes today."));
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });

  it("goes, oldest first, past the byte cap", async () => {
    const { said, clock } = setup({ maxBytes: 200 });
    for (const [at, who] of ["g1a", "g1b", "g1c"].entries()) {
      clock.now += 1;
      await said.offer(offered(`${String(at)} ${"x".repeat(80)}`, { who, room: `#r${String(at)}` }));
    }
    expect(said.expire(100)).toBeGreaterThan(0);
    expect(said.get("#r2", "m3")).toBeDefined();
    expect(said.get("#r0", "m1")).toBeUndefined();
  });
});

describe("the question's own line", () => {
  const SPOKEN = "@jarvis what did they decide?";

  it("taken with its speaker drops the latest answer to it, and no other", async () => {
    const { said, clock } = setup();
    await said.offer(offered("first", { who: BEN }));
    clock.now += 60_000;
    await said.offer(offered("second", { who: BEN }));
    said.drop("#bubble", "q1", { account: BEN, text: SPOKEN });
    expect([said.get("#bubble", "m1"), said.get("#bubble", "m2")]).toEqual([answer("first"), undefined]);
  });

  it("taken from another account, in another room, or with other words drops nothing", async () => {
    const { said } = setup();
    await said.offer(offered("first", { who: ANNA }));
    said.drop("#bubble", "q1", { account: BEN, text: SPOKEN });
    said.drop("#other", "q1", { account: ANNA, text: SPOKEN });
    said.drop("#bubble", "q1", { account: ANNA, text: "something else" });
    expect(said.get("#bubble", "m1")).toBeDefined();
    said.drop("#bubble", "q1", { account: ANNA, text: SPOKEN });
    expect(said.get("#bubble", "m1")).toBeUndefined();
  });
});

describe("the routes' inputs", () => {
  it("answer a bad or odd query with a 400 or a 404, never a 500, and never cache", async () => {
    const { said, app } = setup();
    await said.offer(offered("It closes today."));
    const get = (query: string) =>
      app.request(
        `/api/jarvis/said${query}`,
        { headers: { cookie: `__Host-session=${ANNA_TOKEN}` } },
        { incoming: { socket: { remoteAddress: "203.0.113.7" } } },
      );
    const longId = "a".repeat(10_000);
    const table: [string, number][] = [
      ["", 400],
      ["?room=%23bubble", 400],
      ["?id=m1", 400],
      ["?room=%23bubble&room=%23bubble&id=m1", 400],
      ["?room=%23bubble&id=m1&id=m1", 400],
      [`?room=%23bubble&id=${longId}`, 400],
      ["?room=%23bubble&id=m%201", 400],
      ["?room=bubble&id=m1", 400],
      ["?room=%23BUBBLE&id=m1", 404],
      ["?room=%23bubble&id=M1", 404],
      ["?room=%23bubble&id=m1", 200],
    ];
    for (const [query, status] of table) {
      const response = await get(query);
      expect([query.slice(0, 40), response.status]).toEqual([query.slice(0, 40), status]);
      expect(response.headers.get("cache-control")).toBe("no-store");
    }
  });

  it("answer off while Jarvis is off", async () => {
    const { read } = setup({ on: false });
    const response = await read("#bubble", "m1");
    expect([response.status, await response.json()]).toEqual([200, { status: "off" }]);
  });
});

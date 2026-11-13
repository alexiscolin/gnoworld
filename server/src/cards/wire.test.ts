import { createHash } from "node:crypto";
import type { DatabaseSync } from "node:sqlite";
import { openDatabase } from "@gnoworld/service/db";
import { logger } from "@gnoworld/service/log";
import { afterEach, describe, expect, it, vi } from "vitest";
import { makeApp } from "../app.ts";
import { startChat, type Chat } from "../chat.ts";
import { migrations } from "../migrations.ts";
import type { Answer } from "../moderation/provider.ts";
import { answer } from "../testing/answers.ts";
import { fakeErgo, message, PASSWORD, welcome } from "../testing/fakeErgo.ts";
import { Secret } from "@gnoworld/service/settings";
import { makeStream } from "../stream/stream.ts";
import { KEEP_MS, MAX_BYTES, MAX_ROWS } from "./expire.ts";
import { cardsBoot, cardsFlow } from "./wire.ts";

// L3 (docs/plans/link-previews.md §3, §7): the wiring, through startChat as main calls it: cards off do nothing; on, a line that passed
// moderation asks the reader once, a REDACT and an edit each take the card and tell it, and nothing reaches the reader before the pass.
const T0 = Date.parse("2026-11-11T12:00:00.000Z");
const PEPPER = "a-pepper-of-forty-characters-0123456789";
const RULES = { bannedWords: ["spam"], linksPerMessage: 3, mentionsPerMessage: 5, linksForNewAccount: 2 };
const OFF = {
  openaiKey: undefined,
  thresholds: {},
  newAccountHours: 24,
  mute: { strikes: 3, windowMinutes: 10, minutes: 5, max: 50 },
};
const JPEG = Buffer.from([
  0xff, 0xd8, 0xff, 0xc0, 0, 17, 8, 0, 90, 0, 160, 3, 1, 0x22, 0, 2, 0x11, 1, 3, 0x11, 1,
]).toString("base64");
const SHA = createHash("sha256").update("https://example.com/a").digest("hex");
const started: { db: DatabaseSync; chat: Chat }[] = [];
afterEach(async () => {
  for (const { db, chat } of started.splice(0)) {
    await chat.stop();
    db.close();
  }
});

async function setup({
  cards = true,
  pass = true,
  provider,
}: { cards?: boolean; pass?: boolean; provider?: (text: string) => Promise<Answer | "unchecked"> } = {}) {
  const ergo = await fakeErgo();
  const db = openDatabase(":memory:", migrations);
  const reader = vi.fn(() =>
    Promise.resolve({ title: "A title", description: "", site: "", picture: { width: 160, height: 90, jpeg: JPEG } }),
  );
  const chat = startChat(
    db,
    {
      worlds: new Map([["bubble", { rules: RULES }]]),
      ergo: { host: "127.0.0.1", port: ergo.port, password: PASSWORD },
      moderation: OFF,
    },
    {
      log: logger(PEPPER, () => undefined),
      pepper: PEPPER,
      now: () => T0,
      // A line passes, or hides: the same provider the cards' check goes through, by its text.
      provider: provider ?? (() => Promise.resolve(pass ? answer() : answer({ hate: true }))),
      ...(cards ? { cards: { reader, thresholds: {} } } : {}),
    },
  );
  started.push({ db, chat });
  const peer = await ergo.peer(0);
  await welcome(peer);
  const app = makeApp(
    logger(PEPPER, () => undefined),
    () => true,
  );
  app.route("/api/stream", chat.stream);
  // The card events a reader of #bubble gets on the stream, read until `count` have come.
  const cardEvents = async (count: number): Promise<unknown[]> => {
    const response = await app.request(
      "/api/stream?rooms=%23bubble",
      {},
      { incoming: { socket: { remoteAddress: "203.0.113.7" } } },
    );
    const reader = response.body?.getReader();
    let text = "";
    const frames = (): unknown[] =>
      [...text.matchAll(/event: card\ndata: (.*)\n\n/g)].map(([, data = ""]) => JSON.parse(data) as unknown);
    while (frames().length < count) {
      const chunk: { done: boolean; value?: Uint8Array } | undefined = await reader?.read();
      if (chunk === undefined || chunk.done) break;
      text += new TextDecoder().decode(chunk.value);
    }
    await reader?.cancel();
    return frames();
  };
  return { chat, peer, reader, db, cardEvents };
}

describe("the cards in the chat", () => {
  it("are none when off: no flow, and a line with a link asks nobody", async () => {
    const { chat, peer, reader, db } = await setup({ cards: false });
    peer.say(message("account=g1a;msgid=m1", "a!u@h", ["#bubble", "https://example.com/a"]));
    await expect.poll(() => db.prepare("SELECT msgid FROM verdicts").all()).toHaveLength(1);
    expect(chat.cards).toBeUndefined();
    expect(reader).not.toHaveBeenCalled();
  });

  it("read a passed line's link once and serve its card after the check", async () => {
    const { chat, peer, reader } = await setup();
    peer.say(message("account=g1a;msgid=m1", "a!u@h", ["#bubble", "look https://example.com/a"]));
    await expect.poll(() => chat.cards?.lines("#bubble", ["m1"]).length).toBe(1);
    expect(reader).toHaveBeenCalledExactlyOnceWith("https://example.com/a");
  });

  it("ask nobody for a line moderation hid", async () => {
    const { chat, peer, reader, db } = await setup({ pass: false });
    peer.say(message("account=g1a;msgid=m1", "a!u@h", ["#bubble", "https://example.com/a"]));
    await expect.poll(() => db.prepare("SELECT msgid FROM verdicts WHERE action = 'hide'").all()).toHaveLength(1);
    await chat.cards?.idle();
    expect(reader).not.toHaveBeenCalled();
  });

  it("go when the link tells a REDACT of the line, and the wire says so with a null key", async () => {
    const { chat, peer, cardEvents } = await setup();
    peer.say(message("account=g1a;msgid=m1", "a!u@h", ["#bubble", "https://example.com/a"]));
    await expect.poll(() => chat.cards?.lines("#bubble", ["m1"]).length).toBe(1);
    peer.say(":ergo.test!u@h REDACT #bubble m1 :gone");
    await expect.poll(() => chat.cards?.lines("#bubble", ["m1"]).length).toBe(0);
    expect(await cardEvents(2)).toEqual([
      { msgid: "m1", room: "#bubble", key: SHA },
      { msgid: "m1", room: "#bubble", key: null },
    ]);
  });

  it("go when the line is edited: the replaced line has none, told with a null key, the edit its own", async () => {
    const { chat, peer, cardEvents } = await setup();
    peer.say(message("account=g1a;msgid=m1", "a!u@h", ["#bubble", "https://example.com/a"]));
    await expect.poll(() => chat.cards?.lines("#bubble", ["m1"]).length).toBe(1);
    peer.say(message("account=g1a;msgid=m2;+gnoworld/edit=m1", "a!u@h", ["#bubble", "https://example.org/b"]));
    await expect.poll(() => chat.cards?.lines("#bubble", ["m2"]).length).toBe(1);
    expect(chat.cards?.lines("#bubble", ["m1"])).toEqual([]);
    expect(await cardEvents(3)).toEqual([
      { msgid: "m1", room: "#bubble", key: SHA },
      { msgid: "m1", room: "#bubble", key: null },
      { msgid: "m2", room: "#bubble", key: createHash("sha256").update("https://example.org/b").digest("hex") },
    ]);
  });

  it("keep the lines' breaker shut: five unchecked card checks open the cards' own breaker (a sixth is not asked), and a line still reaches the provider", async () => {
    const asked: string[] = [];
    const provider = (text: string): Promise<Answer | "unchecked"> => {
      asked.push(text);
      return Promise.resolve(text === "A title" ? "unchecked" : answer());
    };
    const { peer, db } = await setup({ provider });
    for (let n = 0; n < 6; n += 1)
      peer.say(message(`account=g1a;msgid=c${String(n)}`, "a!u@h", ["#bubble", `https://site${String(n)}.example/`]));
    await expect.poll(() => asked.filter((text) => text === "A title").length).toBe(5);
    peer.say(message("account=g1a;msgid=plain", "a!u@h", ["#bubble", "hello"]));
    await expect
      .poll(() => db.prepare("SELECT action FROM verdicts WHERE msgid = 'plain'").all())
      .toEqual([{ action: "pass" }]);
    expect(asked).toContain("hello");
  });
});

// L3: the boot refuses cards without OpenAI's key (a card is checked or never shown), and the retention defaults are what the plan says.
const CARDS_OFF = { enabled: false, readerUrl: undefined, thresholds: {} };
const CARDS_ON = { enabled: true, readerUrl: "http://link_reader:8084", thresholds: {} };
const MODERATION = {
  thresholds: {},
  newAccountHours: 24,
  mute: { strikes: 3, windowMinutes: 10, minutes: 5, max: 50 },
};
const KEY = new Secret("sk-test");

describe("cardsBoot", () => {
  it("refuses cards on without OpenAI's key", () => {
    expect(() => cardsBoot({ cards: CARDS_ON, moderation: { ...MODERATION, openaiKey: undefined } })).toThrow(
      "OPENAI_API_KEY_FILE",
    );
  });

  it("starts nothing with cards off, key or no key, and expires nothing", () => {
    for (const openaiKey of [undefined, KEY]) {
      const boot = cardsBoot({ cards: CARDS_OFF, moderation: { ...MODERATION, openaiKey } });
      expect(boot.options).toEqual({});
      expect(boot.expire(10)).toBe(0);
    }
  });

  it("gives the chat the reader and the card thresholds with cards on and a key", () => {
    const { options } = cardsBoot({ cards: CARDS_ON, moderation: { ...MODERATION, openaiKey: KEY } });
    expect(options.cards?.thresholds).toEqual({});
    expect(options.cards?.reader).toBeTypeOf("function");
  });
});

describe("the retention defaults", () => {
  it("are 30 days, 2,000 pages and 32 MiB of pictures", () => {
    expect(KEEP_MS).toBe(30 * 24 * 60 * 60 * 1000);
    expect(MAX_ROWS).toBe(2000);
    expect(MAX_BYTES).toBe(33_554_432);
  });
});

describe("cardsFlow's check", () => {
  it("is unchecked, with no call, while the lines' breaker is open, and reads the raw client behind a breaker of its own", async () => {
    const raw = vi.fn(() => Promise.resolve("unchecked" as const));
    const ask = Object.assign(vi.fn(), { open: () => true, raw });
    const flow = cardsFlow({
      db: openDatabase(":memory:", migrations),
      roles: { worlds: new Map() },
      pepper: "a-pepper-of-forty-characters-0123456789",
      log: () => undefined,
      now: () => 0,
      stream: makeStream(),
      ask,
      cards: {
        reader: () => Promise.resolve({ title: "t", description: "", site: "", picture: null }),
        thresholds: {},
      },
    });
    flow?.heard({ room: "#bubble", account: "g1a", msgid: "m1", text: "https://example.com/a" });
    await flow?.idle();
    expect(raw).not.toHaveBeenCalled();
    expect(ask).not.toHaveBeenCalled();
    flow?.stop();
  });
});

import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import type { DatabaseSync } from "node:sqlite";
import {
  TRANSLATIONS_WAIT_MS,
  type JarvisTranslate,
  type JarvisTranslation,
  type TranslationEvent,
} from "@gnoworld/schemas";
import { openDatabase } from "@gnoworld/service/db";
import { afterEach, describe, expect, it, vi } from "vitest";
import type { Said } from "../irc/link.ts";
import { migrations } from "../migrations.ts";
import type { Typed } from "../rooms/types.ts";
import { makeTranslationFlow, type TranslationFlowOptions } from "./flow.ts";
import type { Language } from "./store.ts";

// A line that passed moderation is translated once into each language in use on its world and stored; a GET asks the missing ones;
// a line taken, edited or hidden loses them; the budget's guards hold.
const MINUTE = 60_000;
const T0 = Date.parse("2026-11-13T12:00:00.000Z");
const RULES = { bannedWords: [], linksPerMessage: 3, mentionsPerMessage: 5, linksForNewAccount: 2 };
const ROLES: Typed = {
  worlds: new Map([
    [
      "bubble",
      {
        rules: RULES,
        groups: new Map([["crew", new Set(["alice"])]]),
        rooms: new Map([
          ["#bubble/crew", { type: "members" as const, readers: "crew", hidden: false }],
          ["#bubble/secret", { type: "open" as const, hidden: true }],
        ]),
      },
    ],
  ]),
};
const said = (over: Partial<Said> = {}): Said => ({
  room: "#bubble",
  account: "alice",
  msgid: "m1",
  text: "Hello there",
  ...over,
});
type Translate = NonNullable<TranslationFlowOptions["translate"]>;
const made = (text: string): Awaited<ReturnType<Translate>> => ({
  ok: true,
  answer: { status: "translated", text, from: "en" },
});
const cleanups: (() => void)[] = [];
afterEach(() => {
  for (const clean of cleanups.splice(0)) clean();
});

function setup(
  more: Omit<Partial<TranslationFlowOptions>, "languages"> & {
    languages?: readonly Language[] | TranslationFlowOptions["languages"];
  } = {},
  db: DatabaseSync = openDatabase(":memory:", migrations),
) {
  const clock = { now: T0 };
  const calls: JarvisTranslate[] = [];
  const events: TranslationEvent[] = [];
  const translate: Translate = (request) => {
    calls.push(request);
    return Promise.resolve(made(`${request.language}:${request.text}`));
  };
  const { languages = ["fr"], ...options } = more;
  const flow = makeTranslationFlow({
    db,
    roles: ROLES,
    translate,
    languages: typeof languages === "function" ? languages : () => languages,
    publish: (event) => events.push(event),
    log: () => undefined,
    now: () => clock.now,
    ...options,
  });
  cleanups.push(() => {
    flow.stop();
  });
  const index = (over: Partial<Said> = {}) => {
    const { room, msgid, account, text } = said(over);
    db.prepare(
      "INSERT INTO lines (room, world, msgid, account, at, link, text) VALUES (?, 'bubble', ?, ?, 1, 0, ?)",
    ).run(room, msgid, account, text);
  };
  return { db, flow, clock, calls, events, index };
}

describe("a line that passed moderation", () => {
  it("is translated into each language in use on its world, stored and told, once", async () => {
    const t = setup({ languages: ["fr", "de"] });
    t.flow.heard(said());
    await t.flow.idle();
    expect(t.calls.map(({ language }) => language).toSorted()).toEqual(["de", "fr"]);
    expect(t.calls[0]?.text).toBe("Hello there");
    expect(t.events.map(({ language, msgid, room }) => [language, msgid, room]).toSorted()).toEqual([
      ["de", "m1", "#bubble"],
      ["fr", "m1", "#bubble"],
    ]);
    t.flow.heard(said());
    await t.flow.idle();
    expect(t.calls).toHaveLength(2);
  });

  it("is made for 4 languages at most, and for none when none is in use", async () => {
    const many = setup({ languages: ["fr", "de", "es", "it", "pt"] });
    many.flow.heard(said());
    await many.flow.idle();
    expect(many.calls).toHaveLength(4);
    const none = setup({ languages: [] });
    none.flow.heard(said());
    await none.flow.idle();
    expect(none.calls).toEqual([]);
  });

  it.each([
    ["a members room", said({ room: "#bubble/crew" })],
    ["a hidden room", said({ room: "#bubble/secret" })],
    ["a line to operators alone", said({ few: true })],
    ["a blank line", said({ text: "   \n " })],
    ["a line that is a link and nothing else", said({ text: " https://example.com/a?b=1 " })],
  ])("is not translated: %s", async (_what, line) => {
    const t = setup();
    t.flow.heard(line);
    await t.flow.idle();
    expect(t.calls).toEqual([]);
    expect(t.events).toEqual([]);
  });

  it("is not translated when Jarvis is off (no call at all), and nothing is sent", async () => {
    const t = setup({ translate: undefined });
    t.flow.heard(said());
    await t.flow.idle();
    expect(t.events).toEqual([]);
  });

  it.each<[string, Awaited<ReturnType<Translate>>]>([
    ["spent", { ok: true, answer: { status: "spent" } }],
    ["off", { ok: true, answer: { status: "off" } }],
    ["a failure", { ok: false }],
  ])("stores nothing and tells nothing on %s", async (_what, answer) => {
    const t = setup({ translate: () => Promise.resolve(answer) });
    t.flow.heard(said());
    await t.flow.idle();
    expect(t.events).toEqual([]);
    expect(t.flow.stored("#bubble", ["m1"], "fr")).toEqual([]);
  });

  it("stores `original` as such, told, so the line is not asked again", async () => {
    const answers: JarvisTranslation[] = [{ status: "original" }];
    const t = setup({ translate: () => Promise.resolve({ ok: true, answer: answers[0] ?? { status: "off" } }) });
    t.flow.heard(said());
    await t.flow.idle();
    expect(t.events).toEqual([{ room: "#bubble", msgid: "m1", language: "fr", status: "original" }]);
    expect(t.flow.stored("#bubble", ["m1"], "fr")).toEqual([{ msgid: "m1", status: "original" }]);
  });

  it("makes no more than 4 at once and queues the rest", async () => {
    let running = 0;
    let peak = 0;
    const open: (() => void)[] = [];
    const t = setup({
      translate: () =>
        new Promise((resolve) => {
          running += 1;
          peak = Math.max(peak, running);
          open.push(() => {
            running -= 1;
            resolve(made("x"));
          });
        }),
    });
    for (let at = 0; at < 8; at += 1) t.flow.heard(said({ msgid: `m${String(at)}` }));
    await vi.waitFor(() => {
      expect(running).toBe(4);
    });
    while (open.length > 0) {
      open.shift()?.();
      await Promise.resolve();
    }
    await t.flow.idle();
    expect(peak).toBe(4);
    expect(t.events).toHaveLength(8);
  });

  it("makes 60 in a minute and the 61st waits, made by a later ask once the minute is over", async () => {
    const t = setup();
    for (let at = 0; at < 61; at += 1) {
      t.index({ msgid: `m${String(at)}` });
      t.flow.heard(said({ msgid: `m${String(at)}` }));
    }
    await t.flow.idle();
    expect(t.calls).toHaveLength(60);
    t.clock.now += MINUTE + 1;
    const answer = await t.flow.asked({ room: "#bubble", ids: ["m60"], language: "fr", signedIn: true });
    expect(answer.translations.map(({ msgid }) => msgid)).toEqual(["m60"]);
    expect(t.calls).toHaveLength(61);
  });
});

describe("a line taken, edited or hidden", () => {
  it("loses its translations at once when taken (REDACT)", async () => {
    const t = setup({ languages: ["fr", "de"] });
    t.flow.heard(said());
    await t.flow.idle();
    t.flow.redacted("#bubble", "m1");
    expect(t.flow.stored("#bubble", ["m1"], "fr")).toEqual([]);
    expect(t.flow.stored("#bubble", ["m1"], "de")).toEqual([]);
  });

  it("is not stored by a making that finishes after the line was taken", async () => {
    const release: (() => void)[] = [];
    const t = setup({
      translate: () =>
        new Promise((resolve) => {
          release.push(() => {
            resolve(made("late"));
          });
        }),
    });
    t.flow.heard(said());
    await vi.waitFor(() => {
      expect(release).toHaveLength(1);
    });
    t.flow.redacted("#bubble", "m1");
    release[0]?.();
    await t.flow.idle();
    expect(t.flow.stored("#bubble", ["m1"], "fr")).toEqual([]);
    expect(t.events).toEqual([]);
  });

  it("is made again from the new text when its own author edits it, under the line's id", async () => {
    const t = setup();
    t.index({ msgid: "m1", text: "Hello there" });
    t.flow.heard(said());
    await t.flow.idle();
    t.flow.heard(said({ msgid: "m2", edits: "m1", text: "Hello again" }));
    await t.flow.idle();
    expect(t.calls.map(({ text }) => text)).toEqual(["Hello there", "Hello again"]);
    expect(t.flow.stored("#bubble", ["m1"], "fr")).toEqual([
      { msgid: "m1", status: "translated", text: "fr:Hello again", from: "en" },
    ]);
  });

  it("loses the words a moderator hid: a REDACT of its author's edit drops the line's translations and tells it", async () => {
    const t = setup();
    t.index({ msgid: "m1", text: "Hello there" });
    t.flow.heard(said());
    await t.flow.idle();
    t.flow.heard(said({ msgid: "m2", edits: "m1", text: "insult words" }));
    await t.flow.idle();
    expect(t.flow.stored("#bubble", ["m1"], "fr")).toMatchObject([{ text: "fr:insult words" }]);
    t.events.length = 0;
    t.flow.redacted("#bubble", "m2");
    expect(t.flow.stored("#bubble", ["m1"], "fr")).toEqual([]);
    expect(t.events).toEqual([{ room: "#bubble", msgid: "m1", language: "fr", status: "gone" }]);
  });

  it("finds the line of an edit the index folded, after a restart (the flow's own memory is empty)", async () => {
    const t = setup();
    t.index({ msgid: "m1", text: "Hello there" });
    t.flow.heard(said());
    await t.flow.idle();
    t.db.prepare("INSERT INTO line_edits (edit, line) SELECT 'm2', rowid FROM lines WHERE msgid = 'm1'").run();
    t.flow.redacted("#bubble", "m2");
    expect(t.flow.stored("#bubble", ["m1"], "fr")).toEqual([]);
  });

  it("makes the edit's new text when it is heard while the old text is still being made", async () => {
    const release: ((text: string) => void)[] = [];
    const t = setup({
      translate: ({ text }) =>
        new Promise((resolve) => {
          release.push((late) => {
            resolve(made(`${late}:${text}`));
          });
        }),
    });
    t.index({ msgid: "m1", text: "Hello there" });
    t.flow.heard(said());
    await vi.waitFor(() => {
      expect(release).toHaveLength(1);
    });
    t.flow.heard(said({ msgid: "m2", edits: "m1", text: "Hello again" }));
    await vi.waitFor(() => {
      expect(release).toHaveLength(2);
    });
    release[0]?.("old");
    release[1]?.("new");
    await t.flow.idle();
    expect(t.flow.stored("#bubble", ["m1"], "fr")).toMatchObject([{ text: "new:Hello again" }]);
  });

  it("is touched by no one else's edit: neither dropped nor made", async () => {
    const t = setup();
    t.index({ msgid: "m1" });
    t.flow.heard(said());
    await t.flow.idle();
    t.flow.heard(said({ msgid: "m2", account: "mallory", edits: "m1", text: "Spam" }));
    await t.flow.idle();
    expect(t.calls).toHaveLength(1);
    expect(t.flow.stored("#bubble", ["m1"], "fr")).toHaveLength(1);
  });
});

describe("a reader's ask", () => {
  it("answers the stored translations with nothing made for them", async () => {
    const t = setup();
    t.flow.heard(said());
    await t.flow.idle();
    const answer = await t.flow.asked({ room: "#bubble", ids: ["m1"], language: "fr", signedIn: false });
    expect(answer).toMatchObject({ translations: [{ msgid: "m1", status: "translated" }], pending: [] });
    expect(t.calls).toHaveLength(1);
  });

  it("makes a missing line from the server's own text, once for every reader, a guest's ask making nothing", async () => {
    const t = setup({ languages: ["fr"] });
    t.index({ msgid: "old", text: "Old words" });
    const guest = await t.flow.asked({ room: "#bubble", ids: ["old"], language: "fr", signedIn: false });
    expect(guest.translations).toEqual([]);
    expect(t.calls).toEqual([]);
    const first = await t.flow.asked({ room: "#bubble", ids: ["old"], language: "fr", signedIn: true });
    expect(first.translations).toEqual([{ msgid: "old", status: "translated", text: "fr:Old words", from: "en" }]);
    await t.flow.asked({ room: "#bubble", ids: ["old"], language: "fr", signedIn: true });
    expect(t.calls).toHaveLength(1);
  });

  it("makes nothing for a members room's line or a line the server does not hold", async () => {
    const t = setup({ languages: [] });
    t.index({ room: "#bubble/crew", msgid: "c1" });
    const answer = await t.flow.asked({ room: "#bubble/crew", ids: ["c1", "ghost"], language: "fr", signedIn: true });
    expect(answer.translations).toEqual([]);
    expect(t.calls).toEqual([]);
  });

  it("names a line still being made as pending when the wait is over, and stores it when it ends", async () => {
    const release: (() => void)[] = [];
    const t = setup({
      languages: ["fr"],
      waitMs: 5,
      translate: () =>
        new Promise((resolve) => {
          release.push(() => {
            resolve(made("slow"));
          });
        }),
    });
    t.index({ msgid: "old" });
    const answer = await t.flow.asked({ room: "#bubble", ids: ["old"], language: "fr", signedIn: true });
    expect(answer).toMatchObject({ translations: [], pending: ["old"] });
    release[0]?.();
    await t.flow.idle();
    expect(t.flow.stored("#bubble", ["old"], "fr")).toHaveLength(1);
    expect(t.events).toHaveLength(1);
  });

  it("answers before the page's 10 s call limit when a making is slow, the rest pending", async () => {
    vi.useFakeTimers();
    try {
      const t = setup({ languages: ["fr"], translate: () => new Promise(() => undefined) });
      t.index({ msgid: "old" });
      const answered = vi.fn();
      const asking = t.flow.asked({ room: "#bubble", ids: ["old"], language: "fr", signedIn: true });
      asking.then(answered, () => undefined);
      await vi.advanceTimersByTimeAsync(TRANSLATIONS_WAIT_MS);
      expect(TRANSLATIONS_WAIT_MS).toBeLessThan(10_000);
      expect(answered).toHaveBeenCalledWith(expect.objectContaining({ pending: ["old"] }));
    } finally {
      vi.useRealTimers();
    }
  });

  it("names a line the breaker left unmade as later, not pending", async () => {
    const t = setup();
    for (let at = 0; at < 60; at += 1) {
      t.index({ msgid: `m${String(at)}` });
      t.flow.heard(said({ msgid: `m${String(at)}` }));
    }
    await t.flow.idle();
    t.index({ msgid: "m60" });
    const answer = await t.flow.asked({ room: "#bubble", ids: ["m60"], language: "fr", signedIn: true });
    expect(answer).toMatchObject({ translations: [], pending: [], later: ["m60"] });
  });

  it("says the halt when the budget is spent or Jarvis is off", async () => {
    const spent = setup({
      languages: ["fr"],
      translate: () => Promise.resolve({ ok: true, answer: { status: "spent" } }),
    });
    spent.index({ msgid: "old" });
    expect(await spent.flow.asked({ room: "#bubble", ids: ["old"], language: "fr", signedIn: true })).toMatchObject({
      halt: "spent",
      pending: [],
    });
  });
});

describe("one account's asks", () => {
  const ask = (t: ReturnType<typeof setup>, account: string, ids: string[]) =>
    t.flow.asked({ room: "#bubble", ids, language: "fr", signedIn: true, account });

  it("start none in a language no signed-in reader of the world reads", async () => {
    const t = setup({ languages: ["fr"] });
    t.index({ msgid: "old" });
    const answer = await t.flow.asked({
      room: "#bubble",
      ids: ["old"],
      language: "de",
      signedIn: true,
      account: "g1alice",
    });
    expect(answer).toEqual({ room: "#bubble", language: "de", translations: [], pending: [] });
    expect(t.calls).toEqual([]);
  });

  it("the asker's own stream as the only reader of X starts no making", async () => {
    const t = setup({ languages: (_world, except) => (except === "g1alice" ? [] : ["de"]) });
    t.index({ msgid: "old" });
    const asked = (account: string) =>
      t.flow.asked({ room: "#bubble", ids: ["old"], language: "de", signedIn: true, account });
    expect((await asked("g1alice")).translations).toEqual([]);
    expect(t.calls).toEqual([]);
    expect((await asked("g1bob")).translations).toHaveLength(1);
    expect(t.calls).toHaveLength(1);
  });

  it("start at most 20 makings a minute, and not another account's", async () => {
    const t = setup({ languages: ["fr"] });
    const ids = Array.from({ length: 30 }, (_, n) => `old${String(n)}`);
    for (const msgid of ids) t.index({ msgid });
    const first = await ask(t, "g1alice", ids);
    expect(t.calls).toHaveLength(20);
    expect(first.later).toEqual(ids.slice(20));
    await ask(t, "g1alice", ids);
    expect(t.calls).toHaveLength(20);
    await ask(t, "g1bob", ids.slice(20));
    expect(t.calls).toHaveLength(30);
    t.clock.now += MINUTE;
    t.index({ msgid: "new" });
    await ask(t, "g1alice", ["new"]);
    expect(t.calls).toHaveLength(31);
  });
});

describe("the store across a restart, and its retention", () => {
  it("answers the stored text from a new flow on the same file, and a REDACT removes it", async () => {
    const dir = mkdtempSync(join(tmpdir(), "translations-"));
    cleanups.push(() => {
      rmSync(dir, { recursive: true, force: true });
    });
    const file = join(dir, "db.sqlite");
    const first = openDatabase(file, migrations);
    const a = setup({}, first);
    a.flow.heard(said());
    await a.flow.idle();
    first.close();
    const second = openDatabase(file, migrations);
    const b = setup({ translate: undefined }, second);
    expect(b.flow.stored("#bubble", ["m1"], "fr")).toEqual([
      { msgid: "m1", status: "translated", text: "fr:Hello there", from: "en" },
    ]);
    b.flow.redacted("#bubble", "m1");
    expect(b.flow.stored("#bubble", ["m1"], "fr")).toEqual([]);
    second.close();
  });

  it("expires rows past 30 days", async () => {
    const t = setup();
    t.flow.heard(said());
    await t.flow.idle();
    t.clock.now += 31 * 24 * 60 * MINUTE;
    expect(t.flow.expire(10)).toBe(1);
    expect(t.flow.stored("#bubble", ["m1"], "fr")).toEqual([]);
  });
});

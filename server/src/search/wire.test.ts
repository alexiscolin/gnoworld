import type { DatabaseSync } from "node:sqlite";
import { openDatabase } from "@gnoworld/service/db";
import { logger } from "@gnoworld/service/log";
import { afterEach, describe, expect, it, vi } from "vitest";
import { z } from "zod";
import { makeApp } from "../app.ts";
import type { Said } from "../irc/link.ts";
import { startChat, type Chat } from "../chat.ts";
import { migrations } from "../migrations.ts";
import type { Answer } from "../moderation/provider.ts";
import { fakeErgo, message, PASSWORD, welcome, type Peer } from "../testing/fakeErgo.ts";
import { makeSearch, type Search } from "./index.ts";
import { indexing } from "./wire.ts";

// Slice 13, B1: the index as the chat hangs it: lines enter through what moderation let through, leave by a REDACT, change by
// their author's edit, and are asked of Ergo again when the link joins a room.
const ORIGIN = "https://gnoworld.test";
const PEPPER = "a-pepper-of-forty-characters-0123456789";
const RULES = { bannedWords: ["spam"], linksPerMessage: 3, mentionsPerMessage: 5, linksForNewAccount: 2 };
const NOTHING = {
  flagged: Object.fromEntries(["hate", "violence"].map((c) => [c, false])),
  scores: Object.fromEntries(["hate", "violence"].map((c) => [c, 0])),
} as unknown as Answer;
const opened: DatabaseSync[] = [];
const chats: Chat[] = [];
afterEach(async () => {
  for (const chat of chats.splice(0)) await chat.stop();
  for (const db of opened.splice(0)) db.close();
});

const worlds = new Map([
  [
    "bubble",
    {
      rules: RULES,
      groups: new Map([["crew", new Set(["g1a"])]]),
      rooms: new Map([
        ["#bubble/crew", { type: "members" as const, readers: "crew", hidden: false }],
        ["#bubble/secret", { type: "open" as const, hidden: true }],
      ]),
    },
  ],
]);

const setup = async ({
  provider = () => Promise.resolve(NOTHING),
  index,
  beforeJoin,
}: {
  provider?: (text: string) => Promise<Answer | "unchecked">;
  index?: (db: DatabaseSync, search: Search) => Search;
  beforeJoin?: (search: Search) => void;
} = {}) => {
  const ergo = await fakeErgo();
  const db = openDatabase(":memory:", migrations);
  opened.push(db);
  const settings = {
    worlds,
    ergo: { host: "127.0.0.1", port: ergo.port, password: PASSWORD },
    moderation: {
      openaiKey: undefined,
      thresholds: {},
      newAccountHours: 24,
      mute: { strikes: 3, windowMinutes: 10, minutes: 5, max: 50 },
    },
    origins: [ORIGIN],
    guests: { on: true, perVisitor: 10, perHour: 600, living: 5000 },
  };
  const made = makeSearch(db, { roles: settings, now: Date.now });
  const search = index === undefined ? made : index(db, made);
  beforeJoin?.(search);
  const logs: string[] = [];
  const log = logger(PEPPER, (line) => logs.push(line));
  const chat = startChat(db, settings, {
    log,
    pepper: PEPPER,
    provider,
    search,
    reconcileMs: 3_600_000,
    sweepMs: 3_600_000,
  });
  chats.push(chat);
  const app = makeApp(
    logger(PEPPER, () => undefined),
    () => true,
  );
  if (chat.guest !== undefined) app.route("/api/guest", chat.guest);
  const peer = await ergo.peer(0);
  await welcome(peer);
  const Ids = z.array(z.object({ msgid: z.string(), account: z.string() }));
  const lines = () => Ids.parse(db.prepare("SELECT msgid, account FROM lines ORDER BY msgid").all());
  const Texts = z.array(z.object({ text: z.string() }));
  const texts = () => Texts.parse(db.prepare("SELECT text FROM lines ORDER BY msgid").all()).map(({ text }) => text);
  const post = (path: string, body: unknown, cookie = "") =>
    app.request(
      `/api/guest${path}`,
      {
        method: "POST",
        headers: { origin: ORIGIN, "content-type": "application/json", ...(cookie === "" ? {} : { cookie }) },
        body: JSON.stringify(body),
      },
      { incoming: { socket: { remoteAddress: "203.0.113.7" } } },
    );
  // A guest's line to #bubble, relayed and answered as Ergo answers it: the reply's status and the guest's nick.
  const guestSays = async (text: string, msgid: string) => {
    const first = await post("", {});
    const cookie = `__Host-guest=${/__Host-guest=([^;]+)/.exec(first.headers.get("set-cookie") ?? "")?.[1] ?? ""}`;
    const sent = post("/say", { room: "#bubble", text }, cookie);
    const relay = await peer.next(/RELAYMSG/);
    const [, label = "", nick = ""] = /^@label=(\S+) RELAYMSG \S+ (\S+) /.exec(relay) ?? [];
    peer.say(`@label=${label};msgid=${msgid} :${nick}!~u@h PRIVMSG #bubble :ok`);
    return { status: (await sent).status, nick };
  };
  return { app, chat, db, peer, search, lines, texts, logs, guestSays };
};

const say = (peer: Peer, tags: string, target: readonly [string, string]): void => {
  peer.say(message(tags, "a!u@h", target));
};

describe("the lines that enter the index through the chat", () => {
  it("holds a line moderation let through, with its author's account and nothing a hidden or unchecked line carries", async () => {
    const { peer, lines } = await setup({
      provider: (text) => Promise.resolve(text === "unk" ? "unchecked" : NOTHING),
    });
    say(peer, "account=g1a;msgid=m1", ["#bubble", "buy spam"]);
    say(peer, "account=g1a;msgid=m2", ["#bubble", "unk"]);
    say(peer, "account=g1b;msgid=m3", ["#bubble", "hello world"]);
    await expect.poll(lines).toEqual([{ msgid: "m3", account: "g1b" }]);
  });

  it("holds no line to a room's operators alone, a members room or a hidden room, though each passed moderation", async () => {
    const { peer, lines } = await setup();
    say(peer, "account=g1a;msgid=m1", ["+#bubble", "to the voices"]);
    say(peer, "account=g1a;msgid=m2", ["#bubble/crew", "to the crew"]);
    say(peer, "account=g1a;msgid=m3", ["#bubble/secret", "to the hidden"]);
    say(peer, "account=g1a;msgid=m4", ["#bubble", "to everyone"]);
    await expect.poll(lines).toEqual([{ msgid: "m4", account: "g1a" }]);
  });

  it("holds no direct message to the bot", async () => {
    const { peer, lines } = await setup();
    say(peer, "account=g1a;msgid=m1", ["gnoworld", "psst"]);
    say(peer, "account=g1a;msgid=m2", ["#bubble", "open"]);
    await expect.poll(lines).toEqual([{ msgid: "m2", account: "g1a" }]);
  });

  it("holds a guest's relayed line, the second entry beside passedLines, as the stream shows it (anon nick, its text)", async () => {
    const { lines, texts, guestSays } = await setup();
    const { status, nick } = await guestSays("hello from outside", "g1");
    expect(status).toBe(200);
    expect(lines()).toEqual([{ msgid: "g1", account: nick }]);
    expect(texts()).toEqual(["hello from outside"]);
  });

  it("answers a guest 200 and keeps its line among the recent ones when the index throws on it (T8)", async () => {
    const add = vi.fn<(said: Said) => void>(() => {
      throw new Error("disk full");
    });
    const { chat, guestSays } = await setup({ index: (_db, search) => ({ ...search, add }) });
    expect((await guestSays("hello from outside", "g1")).status).toBe(200);
    expect(chat.recent("#bubble", "g1x").map(({ text }) => text)).toEqual(["hello from outside"]);
    expect(add).toHaveBeenCalledOnce();
  });

  it("still tells the line to the recent lines when the index throws (T8): the index is called, the chat goes on", async () => {
    const add = vi.fn<(said: Said) => void>(() => {
      throw new Error("disk full");
    });
    const { peer, chat } = await setup({ index: (_db, search) => ({ ...search, add }) });
    say(peer, "account=g1a;msgid=m1", ["#bubble", "hello"]);
    await expect.poll(() => chat.recent("#bubble", "g1x").map(({ text }) => text)).toEqual(["hello"]);
    expect(add).toHaveBeenCalledWith(expect.objectContaining({ msgid: "m1", text: "hello" }));
  });
});

describe("the lines that leave or change through the chat", () => {
  it("drops a line its author deletes and a line a moderator takes (REDACT)", async () => {
    const { peer, texts } = await setup();
    say(peer, "account=g1a;msgid=m1", ["#bubble", "first words"]);
    say(peer, "account=g1a;msgid=m2", ["#bubble", "second words"]);
    say(peer, "account=g1a;msgid=m3", ["#bubble", "third words"]);
    await expect.poll(texts).toHaveLength(3);
    peer.say(":a!u@h REDACT #bubble m1");
    peer.say(":mod!u@h REDACT #bubble m2 :off topic");
    await expect.poll(texts).toEqual(["third words"]);
  });

  it("replaces the text of a line its author edits, and the old words are no more in the index", async () => {
    const { peer, texts } = await setup();
    say(peer, "account=g1a;msgid=m1", ["#bubble", "a typo teh"]);
    await expect.poll(texts).toEqual(["a typo teh"]);
    say(peer, "account=g1a;msgid=m2;+gnoworld/edit=m1", ["#bubble", "a fix the"]);
    await expect.poll(texts).toEqual(["a fix the"]);
  });

  it("keeps a line as it was when another account claims to edit it", async () => {
    const { peer, texts, lines } = await setup();
    say(peer, "account=g1a;msgid=m1", ["#bubble", "mine"]);
    await expect.poll(texts).toEqual(["mine"]);
    peer.say(message("account=g1b;msgid=m2;+gnoworld/edit=m1", "b!u@h", ["#bubble", "forged"]));
    say(peer, "account=g1b;msgid=m3", ["#bubble", "marker"]);
    await expect.poll(texts).toEqual(["mine", "marker"]);
    expect(lines().map(({ msgid }) => msgid)).toEqual(["m1", "m3"]);
  });

  it("keeps a line as it was when the bot hides its author's edit, and indexes none of the hidden text", async () => {
    const { peer, texts } = await setup();
    say(peer, "account=g1a;msgid=m1", ["#bubble", "clean text"]);
    await expect.poll(texts).toEqual(["clean text"]);
    say(peer, "account=g1a;msgid=m2;+gnoworld/edit=m1", ["#bubble", "now spam"]);
    say(peer, "account=g1a;msgid=m3", ["#bubble", "marker"]);
    await expect.poll(texts).toEqual(["clean text", "marker"]);
  });
});

describe("the reconcile when the link joins a room (Q6)", () => {
  it("asks Ergo for each line the index holds in the room, and drops the one Ergo holds no more", async () => {
    const { peer, texts } = await setup({
      beforeJoin: (search) => {
        const at = new Date().toISOString();
        for (const id of ["gone1", "kept1"])
          search.add({ room: "#bubble", account: "g1a", msgid: id, text: `old ${id}`, time: at });
      },
    });
    for (const id of ["gone1", "kept1"]) {
      await peer.next(new RegExp(`^CHATHISTORY AROUND #bubble msgid=${id} 1$`));
      peer.say(":ergo.test BATCH +r chathistory #bubble");
      if (id === "kept1") peer.say(message(`batch=r;account=g1a;msgid=${id}`, "a!u@h", ["#bubble", `old ${id}`]));
      peer.say(":ergo.test BATCH -r");
    }
    await expect.poll(texts).toEqual(["old kept1"]);
  });
});

describe("a delete or an edit heard while the line waits for its check, and the folds (H1, H2, F13705)", () => {
  it("holds no line a REDACT took while the bot was still checking it", async () => {
    let release: (answer: Answer) => void = () => undefined;
    const held = new Promise<Answer>((resolve) => {
      release = resolve;
    });
    const { peer, texts } = await setup({
      provider: (text) => (text === "held words" ? held : Promise.resolve(NOTHING)),
    });
    say(peer, "account=g1a;msgid=m1", ["#bubble", "held words"]);
    peer.say(":a!u@h REDACT #bubble m1");
    peer.say("PING :sync");
    await peer.next(/^PONG sync$/);
    release(NOTHING);
    say(peer, "account=g1a;msgid=m2", ["#bubble", "marker"]);
    await expect.poll(texts).toEqual(["marker"]);
  });

  it("shows a line's newest edit, and a REDACT of the original or of any edit drops the row", async () => {
    const { peer, texts } = await setup();
    say(peer, "account=g1a;msgid=m1", ["#bubble", "alpha original"]);
    say(peer, "account=g1a;msgid=m2;+gnoworld/edit=m1", ["#bubble", "bravo second"]);
    say(peer, "account=g1a;msgid=m3;+gnoworld/edit=m1", ["#bubble", "charlie third"]);
    await expect.poll(texts).toEqual(["charlie third"]);
    peer.say(":mod!u@h REDACT #bubble m2 :hidden");
    await expect.poll(texts).toEqual([]);
    say(peer, "account=g1a;msgid=n1", ["#bubble", "delta original"]);
    say(peer, "account=g1a;msgid=n2;+gnoworld/edit=n1", ["#bubble", "echo edit"]);
    await expect.poll(texts).toEqual(["echo edit"]);
    peer.say(":a!u@h REDACT #bubble n1");
    await expect.poll(texts).toEqual([]);
  });
});

describe("the index failing never stops the chat (T8)", () => {
  it("tells a REDACT to the recent lines when the index's remove throws", async () => {
    const remove = vi.fn(() => {
      throw new Error("locked");
    });
    const { peer, chat } = await setup({ index: (_db, search) => ({ ...search, remove }) });
    say(peer, "account=g1a;msgid=m1", ["#bubble", "hello"]);
    await expect.poll(() => chat.recent("#bubble", "g1x").length).toBe(1);
    peer.say(":a!u@h REDACT #bubble m1");
    await expect.poll(() => chat.recent("#bubble", "g1x")).toEqual([]);
    expect(remove).toHaveBeenCalledWith("#bubble", "m1");
  });

  it("tells an edit to the recent lines when the index's edited throws", async () => {
    const edited = vi.fn(() => {
      throw new Error("locked");
    });
    const { peer, chat } = await setup({ index: (_db, search) => ({ ...search, edited }) });
    say(peer, "account=g1a;msgid=m1", ["#bubble", "first"]);
    say(peer, "account=g1a;msgid=m2;+gnoworld/edit=m1", ["#bubble", "second"]);
    await expect.poll(() => chat.recent("#bubble", "g1x").map(({ text }) => text)).toEqual(["second"]);
    expect(edited).toHaveBeenCalledOnce();
  });

  it("catches and logs a reconcile that fails at the join, and goes on indexing", async () => {
    const reconcile = vi.fn(() => Promise.reject(new Error("link down")));
    const { peer, texts, logs } = await setup({ index: (_db, search) => ({ ...search, reconcile }) });
    await expect.poll(() => reconcile.mock.calls.length).toBeGreaterThan(0);
    say(peer, "account=g1a;msgid=m1", ["#bubble", "still indexed"]);
    await expect.poll(texts).toEqual(["still indexed"]);
    expect(logs.some((line) => line.includes("search_unreconciled"))).toBe(true);
  });
});

// The surviving mutants of the day (slice 13): the wiring on its own, with no index and with no link.
describe("indexing, with no index or no link", () => {
  const said: Said = { room: "#bubble", account: "g1a", msgid: "m1", text: "hi", time: new Date(0).toISOString() };
  const parts = () => ({ recent: { passed: vi.fn(), taken: vi.fn() }, link: () => undefined });

  it("with no index, hands on the recent lines' entries and logs nothing", async () => {
    const log = vi.fn();
    const own = parts();
    const wired = indexing(undefined, log, own);
    wired.recent.passed(said);
    wired.recent.taken("#bubble", "m1");
    const onIn = vi.fn();
    wired.kept({ hooks: { onIn } }).hooks.onIn("#bubble");
    await new Promise((resolve) => setTimeout(resolve, 5));
    expect(own.recent.passed).toHaveBeenCalledWith(said);
    expect(own.recent.taken).toHaveBeenCalledWith("#bubble", "m1");
    expect(onIn).toHaveBeenCalledWith("#bubble");
    expect(log).not.toHaveBeenCalled();
  });

  it("with no link, asks Ergo nothing and answers `unanswered`: the reconcile ends with no fault", async () => {
    const log = vi.fn();
    const answers: unknown[] = [];
    const search = {
      reconcile: async (room: string, fetch: (room: string, msgid: string) => Promise<unknown>) => {
        answers.push(await fetch(room, "m1"));
      },
    } as unknown as Search;
    indexing(search, log, parts())
      .kept({ hooks: { onIn: vi.fn((room: string) => room) } })
      .hooks.onIn("#bubble");
    await expect.poll(() => answers).toEqual(["unanswered"]);
    expect(log).not.toHaveBeenCalled();
  });
});
